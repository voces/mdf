
import { flatten, pPush } from "./util.js";

function formatWhere( where, prefix = "", joiner = " AND " ) {

	if ( typeof where !== "object" || where instanceof Buffer || where instanceof Date || where === null )
		return [ prefix ? prefix + "?" : "?", [ where ]];

	const entries = Object.entries( where );
	const strings = [];
	const args = [];

	entries.forEach( ( [ left, right ] ) => {

		switch ( left ) {

			// MySQL
			case "$identifer": pPush( [ strings, args ], [ prefix ? prefix + "??" : "??", right ] ); break;

			// Comparison
			case "$eq": pPush( [ strings, args ], formatWhere( right, " = " ) ); break;
			case "$gt": pPush( [ strings, args ], formatWhere( right, " > " ) ); break;
			case "$gte": pPush( [ strings, args ], formatWhere( right, " >= " ) ); break;
			case "$lt": pPush( [ strings, args ], formatWhere( right, " < " ) ); break;
			case "$lte": pPush( [ strings, args ], formatWhere( right, " <= " ) ); break;
			case "$ne": pPush( [ strings, args ], formatWhere( right, " <> " ) ); break;
			case "$like": pPush( [ strings, args ], formatWhere( right, " LIKE " ) ); break;
			case "$sounds": pPush( [ strings, args ], formatWhere( right, " SOUNDS LIKE " ) ); break;
			case "$isnull": {

				const [ string, tArgs ] = formatWhere( right );

				strings.push( `ISNULL( ${string} )` );
				args.push( ...tArgs );

				break;

			}

			// Logical
			case "$and": {

				if ( Array.isArray( right ) ) {

					const orStrings = [];
					const subArgs = [];
					right.forEach( part => pPush( [ orStrings, subArgs ], formatWhere( part ) ) );

					pPush( [ strings, args ], [ `( ${orStrings.join( " AND " )} )`, subArgs ] );

				} else pPush( [ strings, args ], formatWhere( right, false, " AND " ) );

				break;

			}
			case "$or": {

				if ( Array.isArray( right ) ) {

					const orStrings = [];
					const subArgs = [];
					right.forEach( part => pPush( [ orStrings, subArgs ], formatWhere( part ) ) );

					pPush( [ strings, args ], [ `( ${orStrings.join( " OR " )} )`, subArgs ] );

				} else pPush( [ strings, args ], formatWhere( right, false, " OR " ) );

				break;

			}

			// Numerical

			default: {

				const [ string, subArgs ] = formatWhere( right, " = " );
				pPush( [ strings, args ], [ "??" + string, [ left, ...subArgs ]] );

			}

		}

	} );

	return [ strings.join( joiner ), args ];

}

function formatPopulates( table, populates ) {

	const populatesParts = populates.map( populate => populate.split( "." ) ).sort( ( a, b ) => a.length > b.length );

	// Expand populates (i.e., if only a.b is passed, generate a)
	for ( let i = 0; i < populatesParts.length; i ++ )
		if ( populatesParts[ i ].length > 1 )
			for ( let n = 0; n < populatesParts[ i ].length; n ++ )
				if ( ! populatesParts.find( parts => parts.length - 1 === n && parts.every( ( part, index ) => part === populatesParts[ i ][ index ] ) ) )
					populatesParts.push( populatesParts[ i ].slice( 0, n + 1 ) );

	populatesParts.sort( ( a, b ) => a.length > b.length );

	const done = populatesParts.map( populate => {

		const path = [ ...populate ];
		let relation = table.relations[ populate.shift() ];

		while ( populate.length )
			relation = relation.table.relations[ populate.shift() ];

		return { path, relation };

	} );

	return done;

}

export default class ZQL {

	static async autogen( query, database ) {

		// Grab our data from SQL
		const [[ tableNames ], [ constraints ], [ columns ]] = await Promise.all( [
			query( `SELECT table_name AS \`table\` FROM information_schema.tables${database ? " WHERE table_schema = ?" : ""};`, database ? [ database ] : [] ),
			query( `SELECT constraint_name name, table_name table1, column_name column1, referenced_table_name table2, referenced_column_name column2 FROM information_schema.key_column_usage WHERE referenced_table_schema IS NOT NULL${database ? " AND constraint_schema = ?" : ""};`, database ? [ database ] : [] ),
			query( `SELECT table_name \`table\`, column_name \`name\`, column_key \`key\` FROM information_schema.columns${database ? " WHERE table_schema = ?" : ""};`, database ? [ database ] : [] )

		] );

		// Our (initially empty) fleshed out tables
		const tables = tableNames.reduce( ( tables, table ) => Object.assign( tables, { [ table.table ]: {} } ), {} );

		// Flesh out the tables
		tableNames.forEach( ( { table } ) => Object.assign( tables[ table ], {
			name: table,
			relations: Object.assign(
				constraints
					.filter( relation => relation.table1 === table )
					.reduce( ( relations, relation ) => Object.assign( relations, { [ relation.column1 ]: {
						table: tables[ relation.table2 ],
						on: {
							[ relation.column1 ]: relation.column2
						},
						type: "one"
					} } ), {} ),
				constraints
					.filter( relation => relation.table1 === table || relation.table2 === table )
					.reduce( ( constraints, constraint ) => Object.assign( constraints, { [ constraint.name ]: {
						table: tables[ constraint.table1 === table ? constraint.table2 : constraint.table1 ],
						on: {
							[ constraint.table1 === table ? constraint.column1 : constraint.column2 ]: constraint.table1 === table ? constraint.column2 : constraint.column1
						},
						type: "many"
					} } ), {} ) ),
			key: columns.filter( column => column.table === table && column.key === "PRI" ).map( column => column.name ),
			columns: columns.filter( column => column.table === table ).map( column => column.name )
		} ) );

		return tables;

	}

	constructor( { spec, query, format, database, autogen, replacer, populater } ) {

		if ( spec ) {

			this.spec = spec;
			this.specTables = Object.values( spec );

		}

		if ( replacer ) this.replacer = replacer;
		if ( populater ) this.populater = populater;
		if ( format ) this._format = format;

		if ( query ) {

			this._query = query;
			if ( autogen ) this.asyncConstructor( database );

		}

	}

	async asyncConstructor( database ) {

		this.autogen = true;

		this.spec = await ZQL.autogen( this._query, database );
		this.specTables = Object.values( this.spec );

		this._isReady = true;
		if ( this._ready ) this._ready();

	}

	get ready() {

		if ( this._isReady ) return Promise.resolve();

		return new Promise( resolve => this._ready = resolve );

	}

	formatTables( table, populates = [] ) {

		const tables = {};
		tables[ table ] = [ this.spec[ table ] ];

		for ( let i = 0; i < populates.length; i ++ ) {

			if ( tables[ populates[ i ].relation.table.name ] === undefined ) tables[ populates[ i ].relation.table.name ] = [];
			tables[ populates[ i ].relation.table.name ].push( populates[ i ] );

		}

		return [ Object.entries( tables ), Object.keys( tables ) ];

	}

	formatWhere( where ) {

		return formatWhere( where );

	}

	formatPopulates( table, populates ) {

		return formatPopulates( table, populates );

	}

	format( table, { where, populates, limit } ) {

		if ( typeof table === "object" ) table = table.name;

		if ( ! table ) throw new Error( "`table` must be passed" );

		populates = this.cleanPopulates( populates, table );

		// Group select & relations by table
		const [ tables, tablesKey ] = this.formatTables( table, populates );
		const [ whereQuery, whereArgs ] = where ? formatWhere( where ) : [];

		const query = tables.map( ( [ table, unions ] ) => `
SELECT t1.*, GROUP_CONCAT( _table_source ) AS _table_sources FROM (${unions.map( () => `
	SELECT DISTINCT ??.*, ? AS _table_source
	FROM ?? ${populates.map( () => `
		LEFT JOIN ?? AS ?? ON ??.?? = ??.??` ).join( "" )} ${whereQuery ? `
	WHERE ${whereQuery}` : ""} ${limit ? `
	LIMIT ?` : ""}` ).join( `
	UNION DISTINCT` )}
) t1 GROUP BY ${this.spec[ table ].key.map( () => "??" ).join( ", " )};` ).join( "\n" );

		const args = flatten( tables.map( ( [ tableName, unions ] ) => [
			unions.map( source => [
				this.specTables.includes( source ) ? source.name : source.path.join( "__" ),
				this.specTables.includes( source ) ? source.name : source.path.join( "__" ),
				table,
				populates.map( populate => [
					populate.relation.table.name,
					populate.path.join( "__" ),
					populate.path.slice( 0, - 1 ).join( "__" ) || table,
					Object.keys( populate.relation.on )[ 0 ],
					populate.path.join( "__" ),
					Object.values( populate.relation.on )[ 0 ] ] ),
				whereArgs || [],
				limit ? limit : [] ] ),
			this.spec[ tableName ].key ] ) );

		return [ query, args, tablesKey, populates ];

	}

	cleanPopulates( populates, table ) {

		if ( populates ) {

			if ( ! this.spec[ table ] ) throw new Error( `Unknown table '${table}'` );

			if ( typeof populates[ 0 ] === "string" ) return formatPopulates( this.spec[ table ], populates );
			return populates;

		}

		return [];

	}

	populater( doc, field, value ) {

		doc[ field ] = value;

	}

	graphize( results, tablesKey, { replacer = this.replacer, populates } = {} ) {

		if ( ! Array.isArray( results[ 0 ] ) ) results = [ results ];

		populates = this.cleanPopulates( populates, tablesKey[ 0 ] );

		if ( replacer ) results = results.map( ( table, tableIndex ) => table.map( row => replacer( row, this.spec[ tablesKey[ tableIndex ] ] ) ) );

		// Grab all core documents
		const result = results[ 0 ].filter( row => row._table_sources.split( "," ).includes( tablesKey[ 0 ] ) );

		// Populate primary collection, then out breadth-first
		let processed = 0;
		let round = 1;
		let docs = result;
		while ( processed < populates.length ) {

			const nextDocs = [];

			const roundPopulates = populates.filter( populate => populate.path.length === round );
			for ( let i = 0; i < roundPopulates.length; i ++ ) {

				// Grab all candidate documents that may be added next layer (the one we're creating; filters by just source table)
				const table = results[ tablesKey.indexOf( roundPopulates[ i ].relation.table.name ) ];
				const [ source, target ] = Object.entries( roundPopulates[ i ].relation.on )[ 0 ];

				// Populate documents with next layer
				const fullfillment = roundPopulates[ i ].path[ roundPopulates[ i ].path.length - 1 ];
				if ( roundPopulates[ i ].relation.type === "one" )
					for ( let n = 0; n < docs.length; n ++ ) {

						const value = table.find( row => docs[ n ][ source ] === row[ target ] );
						this.populater( docs[ n ], fullfillment, value, roundPopulates[ i ] );
						nextDocs.push( value );

					}

				else
					for ( let n = 0; n < docs.length; n ++ ) {

						const value = table.filter( row => docs[ n ][ source ] === row[ target ] );
						this.populater( docs[ n ], fullfillment, value, roundPopulates[ i ] );
						nextDocs.push( ...value );

					}

			}

			docs = nextDocs;

			round ++;
			processed += roundPopulates.length;

		}

		return result;

	}

	async select( table, { where, populates = [], limit, replacer = this.replacer } ) {

		if ( this.autogen ) await this.ready;

		populates = this.cleanPopulates( populates, table );

		const [ query, args, tablesKey ] = this.format( table, { where, populates, limit } );

		// eslint-disable-next-line no-console
		if ( this._format ) console.log( this._format( query, args ) );

		return this.graphize( await this._query( query, args ).then( ( [ rows ] ) => rows ), tablesKey, { replacer, populates } );

	}

	// async save( obj, { table = pascalToSnake( obj.constructor.name ), lite = false } = {} ) {

	// 	let query = "INSERT INTO ?? ( ?? ) VALUES ( ? ) ON DUPLICATE KEY UPDATE ?;";
	// 	const entries = Object.entries( obj ).filter( ( [ key ] ) => this.spec[ table ].columns.includes( key ) );
	// 	const args = [ table, entries.map( ( [ key ] ) => key ), entries.map( ( [ , value ] ) => value ), entries.reduce( objectify, {} ) ];
	// 	if ( ! lite ) {

	// 		const select = this.format( table, { where: entries.filter( ( [ key ] ) => this.spec[ table ].key.includes( key ) ).reduce( objectify, {} ) } );

	// 		query += select[ 0 ];
	// 		args.push( ... select[ 1 ] );

	// 	}

	// 	// eslint-disable-next-line no-console
	// 	if ( this._format ) console.log( this._format( query, args ) );

	// 	const results = await this._query( query, args ).then( ( [ rows ] ) => rows );

	// 	if ( lite ) return results;

	// 	return this.graphize( [ results[ 1 ] ], [ table ] )[ 0 ];

	// }

}
