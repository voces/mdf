
function flatten( original ) {

	const arr = [];
	for ( let i = 0; i < original.length; i ++ )
		if ( Array.isArray( original[ i ] ) ) arr.push( ...flatten( original[ i ] ) );
		else arr.push( original[ i ] );

	return arr;

}

const pPush = ( targets, source ) =>
	targets.forEach( ( target, i ) =>
		target.push( ...( Array.isArray( source[ i ] ) ? source[ i ] : [ source[ i ] ] ) ) );

function processWhere( where, prefix = "", joiner = " AND " ) {

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
			case "$eq": pPush( [ strings, args ], processWhere( right, " = " ) ); break;
			case "$gt": pPush( [ strings, args ], processWhere( right, " > " ) ); break;
			case "$gte": pPush( [ strings, args ], processWhere( right, " >= " ) ); break;
			case "$lt": pPush( [ strings, args ], processWhere( right, " < " ) ); break;
			case "$lte": pPush( [ strings, args ], processWhere( right, " <= " ) ); break;
			case "$ne": pPush( [ strings, args ], processWhere( right, " <> " ) ); break;
			case "$like": pPush( [ strings, args ], processWhere( right, " LIKE " ) ); break;
			case "$sounds": pPush( [ strings, args ], processWhere( right, " SOUNDS LIKE " ) ); break;

			// Logical
			case "$and": {

				if ( Array.isArray( right ) ) {

					const orStrings = [];
					const subArgs = [];
					right.forEach( part => pPush( [ orStrings, subArgs ], processWhere( part ) ) );

					pPush( [ strings, args ], [ `( ${orStrings.join( " AND " )} )`, subArgs ] );

				} else pPush( [ strings, args ], processWhere( right, false, " AND " ) );

				break;

			}
			case "$or": {

				if ( Array.isArray( right ) ) {

					const orStrings = [];
					const subArgs = [];
					right.forEach( part => pPush( [ orStrings, subArgs ], processWhere( part ) ) );

					pPush( [ strings, args ], [ `( ${orStrings.join( " OR " )} )`, subArgs ] );

				} else pPush( [ strings, args ], processWhere( right, false, " OR " ) );

				break;

			}

			// Numerical

			default: {

				const [ string, subArgs ] = processWhere( right, " = " );
				pPush( [ strings, args ], [ "??" + string, [ left, ...subArgs ]] );

			}

		}

	} );

	return [ strings.join( joiner ), args ];

}

export default class Query {

	constructor( mfd ) {

		Object.defineProperty( this, "mfd", { value: mfd } );
		this.populates = [];

	}

	render() {

		// Group select & relations by table
		const tables = ( () => {

			const tables = {};
			tables[ this.select.name ] = [ this.select ];

			for ( let i = 0; i < this.populates.length; i ++ ) {

				if ( tables[ this.populates[ i ].relation.target.table.name ] === undefined ) tables[ this.populates[ i ].relation.target.table.name ] = [];
				tables[ this.populates[ i ].relation.target.table.name ].push( this.populates[ i ] );

			}

			this.tables = Object.keys( tables );
			return Object.entries( tables );

		} )();

		const query = tables.map( ( [ table, unions ] ) => `
SELECT t1.*, GROUP_CONCAT( _table_source ) AS _table_sources FROM (${unions.map( () => `
	SELECT DISTINCT ??.*, ? AS _table_source
	FROM ?? ${this.populates.map( () => `
		LEFT JOIN ?? AS ?? ON ??.?? = ??.??` ).join( "" )} ${this.whereQuery ? `
	WHERE ${this.whereQuery}` : ""}` ).join( `
	UNION DISTINCT` )}
) t1 GROUP BY ${this.mfd.collections[ table ].key.map( () => "??" ).join( ", " )};` ).join( "\n" );

		const args = flatten( tables.map( ( [ table, unions ] ) => [
			unions.map( source => [
				typeof source === "function" ? source.name : source.path.join( "__" ),
				typeof source === "function" ? source.name : source.path.join( "__" ),
				this.select.name,
				this.populates.map( populate => [
					populate.relation.target.table.name,
					populate.path.join( "__" ),
					populate.path.slice( 0, - 1 ).join( "__" ) || this.select.name,
					populate.relation.source,
					populate.path.join( "__" ),
					populate.relation.target.column ] ),
				this.whereArgs || [] ] ),
			this.mfd.collections[ table ].key ] ) );

		return [ query, args ];

	}

	select( table ) {

		this.select = this.mfd.collections[ table ];
		return this;

	}

	populate( ...populates ) {

		const populatesParts = populates.map( populate => populate.split( "." ) ).sort( ( a, b ) => a.length > b.length );

		// Expand populates (i.e., if only a.b is passed, generate a)
		for ( let i = 0; i < populatesParts.length; i ++ )
			if ( populatesParts[ i ].length > 1 )
				for ( let n = 0; n < populatesParts[ i ].length; n ++ )
					if ( ! populatesParts.find( parts => parts.length - 1 === n && parts.every( ( part, index ) => part === populatesParts[ i ][ index ] ) ) )
						populatesParts.push( populatesParts[ i ].slice( 0, n + 1 ) );

		populatesParts.sort( ( a, b ) => a.length > b.length );

		this.populates = populatesParts.map( populate => {

			const path = [ ...populate ];
			let relation = this.select.relations[ populate.shift() ];
			while ( populate.length )
				relation = relation.target.table.relations[ populate.shift() ];

			return { path, relation };

		} );

		return this;

	}

	where( where ) {

		this.whereObj = Object.entries( where );

		[ this.whereQuery, this.whereArgs ] = processWhere( where );

		return this;

	}

	execute() {

		const [ query, args ] = this.render();

		if ( this.mfd.debug ) {

			let str = query;
			let i = 0;

			const regex = /\?+/;
			let match = regex.exec( str );
			while ( match ) {

				str = str.slice( 0, match.index ) +
					( match[ 0 ] === "??" ? args[ i ].split( "." ).map( part => `\`${part}\`` ).join( "." ) : `'${args[ i ]}'` ) +
					str.slice( match.index + match[ 0 ].length );

				i ++;
				match = regex.exec( str );

			}

			// eslint-disable-next-line no-console
			console.log( str );

		}

		return this.mfd.pool.query( query, args ).then( ( [ results ] ) => {

			if ( ! Array.isArray( results[ 0 ] ) ) results = [ results ];

			if ( ! this.mfd.lite )
				for ( let i = 0; i < results.length; i ++ )
					for ( let n = 0; n < results[ i ].length; n ++ )
						results[ i ][ n ] = new this.mfd.collections[ this.tables[ i ] ]( Object.assign( results[ i ][ n ], { _new: false } ) );

			const result = results[ 0 ].filter( row => row._table_sources.split( "," ).includes( this.select.name ) );

			// Populate primary collection, breadth-first
			let processed = 0;
			let round = 1;
			while ( processed < this.populates.length ) {

				const populates = this.populates.filter( populate => populate.path.length === round );
				for ( let i = 0; i < populates.length; i ++ ) {

					// Grab source table of layer
					const table = results[ this.tables.indexOf( populates[ i ].relation.target.table.name ) ];

					// Grab all documents in layer
					let docs = result;
					populates[ i ].path.slice( 0, - 1 ).forEach( pathPart =>
						docs = [].concat( ...docs.map( doc => Array.isArray( doc[ pathPart ] ) ? doc[ pathPart ] : [ doc[ pathPart ] ] ) ) );

					// Populate documents with next layer
					const fullfillment = populates[ i ].path[ populates[ i ].path.length - 1 ];
					for ( let n = 0; n < docs.length; n ++ )
						if ( populates[ i ].relation.singleton ) docs[ n ][ fullfillment ] = table.find( row => docs[ n ][ populates[ i ].relation.source ] === row[ populates[ i ].relation.target.column ] );
						else docs[ n ][ fullfillment ] = table.filter( row => docs[ n ][ populates[ i ].relation.source ] === row[ populates[ i ].relation.target.column ] );

				}

				round ++;
				processed += populates.length;

			}

			return result;

		} );

	}

}
