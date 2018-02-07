
function weave( a, b ) {

	const arr = [];
	for ( let i = 0; i < a.length && i < b.length; i ++ )
		arr.push( a[ i ], b[ i ] );

	for ( let i = b.length; i < a.length; i ++ )
		arr.push( a[ i ] );

	for ( let i = a.length; i < b.length; i ++ )
		arr.push( b[ i ] );

	return arr;

}

function flatten( original ) {

	const arr = [];
	for ( let i = 0; i < original.length; i ++ )
		if ( Array.isArray( original[ i ] ) ) arr.push( ...flatten( original[ i ] ) );
		else arr.push( original[ i ] );

	return arr;

}

// query.where( {
// 	"person.name": /Robert/,
// 	"order.total": { $gt: 5 },
// 	"order.total": { $gt: { $identifer: "blah" } }
// } );

// query.where( [] );

const pPush = ( target, source ) => {

	for ( let i = 0; i < target.length; i ++ )
		target[ i ].push( ...( Array.isArray( source[ i ] ) ? source[ i ] : [ source[ i ] ] ) );

};

function processWhere( where, partial = false, joiner = " AND " ) {

	if ( typeof where !== "object" || where instanceof Buffer || where instanceof Date || where === null )
		return [ partial ? " = ?" : "?", [ where ]];

	const entries = Object.entries( where );
	const strings = [];
	const args = [];

	for ( let i = 0; i < entries.length; i ++ ) {

		const [ left, right ] = entries[ i ];

		switch ( left ) {

			case "$identifer": pPush( [ strings, args ], [ partial ? " = ??" : "??", right ] ); break;
			case "$or": {

				const orStrings = [];
				const subArgs = [];
				for ( let i = 0; i < right.length; i ++ )
					pPush( [ orStrings, subArgs ], processWhere( right, false, " OR " ) );

				pPush( [ strings, args ], [ `( ${strings.join( " OR " )} )`, subArgs ] );
				break;

			}

			default: {

				const [ string, subArgs ] = processWhere( right, true );
				pPush( [ strings, args ], [ "??" + string, [ left, ...subArgs ]] );

			}

		}

	}

	return [ strings.join( joiner ), args ];

}

export default class Query {

	constructor( mdf ) {

		Object.defineProperty( this, "mdf", { value: mdf } );
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
			return Object.values( tables );

		} )();

		const query = tables.map( unions => unions.map( () => `
SELECT DISTINCT ??.*
FROM ?? ${this.populates.map( () => "\nLEFT JOIN ?? AS ?? ON ??.?? = ??.??" ).join( "\n" )} ${this.whereQuery ? `
WHERE ${this.whereQuery}` : ""}` ).join( "\nUNION DISTINCT" ) ).join( ";\n" );

		const args = flatten( tables.map( unions => unions.map( source => [
			typeof source === "function" ? source.name : source.path.join( "__" ),
			this.select.name,
			this.populates.map( populate => [
				populate.relation.target.table.name,
				populate.path.join( "__" ),
				populate.path.slice( 0, - 1 ).join( "__" ) || this.select.name,
				populate.relation.source,
				populate.path.join( "__" ),
				populate.relation.target.column ] ),
			this.whereArgs || [] ] ) ) );

		return [ query, args ];

	}

	select( table ) {

		this.select = this.mdf.collections[ table ];
		return this;

	}

	populate( ...populates ) {

		const populatesParts = populates.map( populate => populate.split( "." ) ).sort( ( a, b ) => a.length > b.length );
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
		console.log( this.whereQuery );

		return this;

	}

	execute() {

		const [ query, args ] = this.render();

		{

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

			console.log( str );

		}

		return this.mdf.pool.query( query, args ).then( ( [ results ] ) => {

			// Filter primary collection to those truly selected (i.e., A -> B -> A', only get A)
			const conditions = ( this.whereObj || [] ).filter( ( [ left ] ) => {

				const parts = left.split( "." );
				return parts.length === 1 || ( parts.length === 2 && parts[ 0 ] === this.select.name );

			} ).map( ( [ left, right ] ) => [ left.split( "." ).pop(), right ] );

			const result = results[ 0 ].filter( row => conditions.every( ( [ left, right ] ) => row[ left ] == right ) );

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
					for ( let n = 0; n < populates[ i ].path.length - 1; n ++ )
						docs = [].concat( ...docs.map( doc => Array.isArray( doc[ populates[ i ].path[ n ] ] ) ? doc[ populates[ i ].path[ n ] ] : [ doc[ populates[ i ].path[ n ] ] ] ) );

					// console.log( table );

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
