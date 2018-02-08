
/* eslint-disable no-console */

const MDF = require( "../index.js" );

const mdf = new MDF( {
	host: "localhost",
	user: "test",
	database: "test"
} );

mdf.debug = true;

setTimeout( () => {

	mdf.query( "person" )
		.populate( "friends", "friends.target" )
		.where( { $or: [ { "person.first": "Robert" }, { "person.first": "Brad" } ] } )
		.execute()
		.then( results => console.dir( results, { depth: 4 } ) ).catch( err => console.error( err ) );

	// mdf.query( "person" )
	// 	.populate( "friends" )
	// 	.where( { "friends.source": 2 } )
	// 	.execute()
	// 	.then( results => console.log( results ) ).catch( err => console.error( err ) );

}, 1000 );
