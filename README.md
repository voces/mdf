# mfd
Simple, object-based interaction with SQL.

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
```JavaScript
const MFD = require( "../index.js" );

const mfd = new MFD( {
	host: "localhost",
	user: "test",
	database: "test"
} );
```

### Create
```JavaScript
const tim = new mfd.collections.person( { first: "Tim", last: "Smith" } );
await tim.save();
console.log( ( await mfd.query( "person" ).where( { first: "Tim" } ).execute() )[ 0 ] );

> { id: 6, first: 'Tim', last: 'Smith' }
```

### Read
```JavaScript
mfd.query( "person" )
	.populate( "friends", "friends.target" )
	.where( { $or: [ { "person.first": "Robert" }, { "person.first": "Brad" } ] } )
	.execute()
	.then( results => console.log( results ) ).catch( err => console.error( err ) );

> [ { id: 1,
    first: 'Brad',
    last: 'Hesse',
    friends:
     [ { source: 1,
         target:
          { id: 2,
            first: 'Robert',
            last: 'Coe',
            friends: [ [Object], [Object], [Object] ] } },
       { source: 1, target: { id: 3, first: 'French', last: 'Boy' } },
       { source: 1, target: { id: 4, first: 'James', last: 'Joe' } } ] },
  { id: 2,
    first: 'Robert',
    last: 'Coe',
    friends:
     [ { source: 2,
         target:
          { id: 1,
            first: 'Brad',
            last: 'Hesse',
            friends: [ [Object], [Object], [Object] ] } },
       { source: 2, target: { id: 4, first: 'James', last: 'Joe' } },
       { source: 2,
         target: { id: 5, first: 'Kiefer', last: 'von Gaza' } } ] } ]
```

### Update
```JavaScript
const robert = ( await mfd.query( "person" ).where( { first: "Robert" } ).execute() )[ 0 ];
robert.last = "Coel";
await robert.save();
console.log( ( await mfd.query( "person" ).where( { first: "Robert" } ).execute() )[ 0 ] );

> { id: 2, first: 'Robert', last: 'Coel' }
```
