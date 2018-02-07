
const MDF = require( "../index.js" );

const mdf = new MDF( {
	host: "localhost",
	user: "test",
	database: "test"
} );

setTimeout( () => {

	mdf.query( "person" )
		// .populate( "friends", "friends.target" )
		.where( { $or: [ { "person.first": "Robert" }, { "person.first": "Robert" } ] } )
		.execute()
		.then( results => console.log( results ) ).catch( err => console.error( err ) );

}, 1000 );
