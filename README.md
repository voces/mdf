# zql
Simple, object-based selecting with SQL.

## Examples

### Schema
```MySQL
CREATE TABLE `person` (
	`id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
	`first` VARCHAR(128) NULL DEFAULT NULL,
	`last` VARCHAR(128) NOT NULL,
	PRIMARY KEY (`id`)
);
CREATE TABLE `friend` (
	`source` INT(10) UNSIGNED NOT NULL,
	`target` INT(10) UNSIGNED NOT NULL,
	PRIMARY KEY (`source`, `target`),
	INDEX `likedBy` (`target`),
	CONSTRAINT `friends` FOREIGN KEY (`source`) REFERENCES `person` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `likedBy` FOREIGN KEY (`target`) REFERENCES `person` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
```

### Setup
<details>
<summary>Setup Javascript</summary>

```JavaScript
// Utility
import stringify from "json-stringify-pretty-compact";

// Co-dependency
import MySQL from "mysql2/promise";

// Library
import ZQL from "../ZQL.js";

// Generic model that suppresses values used for population
class Model {

	constructor( obj ) {

		Object.defineProperties( this, {
			_table_source: { writable: true },
			_table_sources: { writable: true }
		} );

		Object.assign( this, obj );

	}

}

// Person model
class Person extends Model {}

// Friend model; is a relationship, thus we only return the related object (or its id)
class Friend extends Model {

	toJSON() {

		if ( this.target ) return this.target;
		return this.targetId;

	}

}

// Lookups
const models = { person: Person, friend: Friend };

( async () => {

	// We still use a normal MySQL connection
	const mysql = await MySQL.createConnection( {
		host: "localhost",
		multipleStatements: true,	// Multiple statements are a must!
		user: "test",
		database: "test"
	} );

	// Query function used by ZQL
	const query = ( ...args ) => mysql.query( ...args );

	// Optional mapping between MySQL's TextRow and our models; note the rows are just that, without populated fields
	const replacer = ( row, table ) => {

		if ( models[ table.name ] ) return new models[ table.name ]( row );
		console.warn( "Unknown model", table );
		return new Model( row );

	};

	// When populating, we don't want to overwrite values; note relationship populations generally don't have an Id or corresponding field to overwrite
	const populater = ( doc, field, value ) => {

		if ( field.endsWith( "Id" ) ) return doc[ field.slice( 0, - 2 ) ] = value;
		if (doc[field]) throw new Error(`Tried to populate over existing field '${field}' on '${doc.constructor.name}'`)
		return doc[ field ] = value;

	};

	// Our ZQL, auto-generating the spec
	const zql = new ZQL( { query/*, format*/, autogen: true, database: "test", replacer, populater } );

	// Make sure the spec is ready
	await zql.ready;

} )().catch( err => ( console.error( err ), process.exit( 1 ) ) );
```
</details>

### Selecting
```JavaScript
// Select the persion with id 1, populating their friends
const person = ( await zql.select( "person", { where: { "person.id": 1 }, populates: [ "friends.targetId" ] } ) )[ 0 ];
console.log( stringify( person, { margins: true } ) );

> {
  "id": 1,
  "first": "Stephen",
  "last": "Strange",
  "friends": [
    { "id": 2, "first": "Christine", "last": "Palmer" },
    { "id": 3, "first": "Nicodemus", "last": "West" },
    { "id": 4, "first": "Jonathan", "last": "Pangborn" }
  ]
}
```
