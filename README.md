# mdf
Simple, object-based interaction with SQL.

## Example

### Schema
```MySQL
CREATE TABLE `person` (
	`id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
	`first` VARCHAR(128) NULL DEFAULT NULL,
	`last` VARCHAR(128) NOT NULL,
	PRIMARY KEY (`id`)
)
CREATE TABLE `friend` (
	`id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
	`source` INT(10) UNSIGNED NOT NULL,
	`target` INT(10) UNSIGNED NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE INDEX `source_target` (`source`, `target`),
	INDEX `likedBy` (`target`),
	CONSTRAINT `friends` FOREIGN KEY (`source`) REFERENCES `person` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `likedBy` FOREIGN KEY (`target`) REFERENCES `person` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
)
```

### Querying
```JavaScript
const MDF = require( "../index.js" );

const mdf = new MDF( {
	host: "localhost",
	user: "test",
	database: "test"
} );

setTimeout( () => {

	mdf.query( "person" )
		.populate( "friends", "friends.target" )
		.where( { $or: [ { "person.first": "Robert" }, { "person.first": "Brad" } ] } )
		.execute()
		.then( results => console.log( results ) ).catch( err => console.error( err ) );

}, 1000 );
```
### Result
```
[ person {
    id: 1,
    first: 'Brad',
    last: 'Hesse',
    friends:
     [ friend {
         id: 1,
         source: 1,
         target: person { id: 2, first: 'Robert', last: 'Coe', friends: [Array] } },
       friend {
         id: 3,
         source: 1,
         target: person { id: 4, first: 'James', last: 'Joe' } } ] },
  person {
    id: 2,
    first: 'Robert',
    last: 'Coe',
    friends:
     [ friend {
         id: 4,
         source: 2,
         target: person { id: 1, first: 'Brad', last: 'Hesse', friends: [Array] } },
       friend {
         id: 5,
         source: 2,
         target: person { id: 4, first: 'James', last: 'Joe' } },
       friend {
         id: 6,
         source: 2,
         target: person { id: 5, first: 'Kiefer', last: 'von Gaza' } } ] } ]
```
