
/* eslint-disable no-console */

import util from "util";
import stringify from "json-stringify-pretty-compact";
import ZQL from "../ZQL.js";
import MySQL from "mysql2/promise";

class Model {

	constructor( obj ) {

		Object.defineProperties( this, {
			_table_source: { writable: true },
			_table_sources: { writable: true }
		} );

		Object.assign( this, obj );

	}

}
class Person extends Model {}
class Friend extends Model {

	toJSON() {

		if ( this.target ) return this.target;
		return this.targetId;

	}

}
const models = { person: Person, friend: Friend };

( async () => {

	const mysql = await MySQL.createConnection( {
		host: "localhost",
		multipleStatements: true,
		user: "test",
		database: "test"
	} );

	const query = ( ...args ) => mysql.query( ...args );
	const replacer = ( row, table ) => {

		if ( models[ table.name ] ) return new models[ table.name ]( row );
		return new Model( row );

	};
	const populater = ( doc, field, value ) => {

		if ( field.endsWith( "Id" ) ) return doc[ field.slice( 0, - 2 ) ] = value;
		return doc[ field ] = value;

	};
	const zql = new ZQL( { query, format: ( ...args ) => mysql.format( ...args ), autogen: true, database: "test", replacer, populater } );

	await zql.ready;

	// Select with populates
	const persons = ( await zql.select( "person", { where: { $or: [ { "person.id": 1 }, { "person.id": 2 } ] }, populates: [ { path: "friends.targetId", limit: 2 } ] } ) );
	console.log( util.inspect( persons, { depth: 4 } ) );
	// console.log( stringify( persons, { margins: true } ) );

	process.exit( 0 );

} )().catch( err => ( console.error( err ), process.exit( 1 ) ) );
