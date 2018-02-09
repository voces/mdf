
import mysql from "mysql2/promise";

import Model from "./Model.js";
import Query from "./Query.js";

export default class MFD {

	constructor( config ) {

		this.config = Object.assign( { multipleStatements: true }, config );
		this.collections = {};

		this._init();

	}

	async _init() {

		// Ensure only one _init runs at a time
		return this._init.promise || ( this._init.promise = ( async () => {

			// Ensure we don't redefine the pool
			if ( this.pool ) return;

			Object.defineProperty( this, "pool", { value: await mysql.createConnection( this.config ) } );

			this.refresh();

			delete this._init.promise;

		} )() );

	}

	async refresh() {

		// Ensure only one refresh runs at a time
		return this.refresh.promise || ( this.refresh.promise = ( async () => {

			// Make sure we have a pool
			if ( ! this.pool ) await this._init();

			// Grab our data from SQL
			const [[ tables ], [ constraints ], [ columns ]] = await Promise.all( [
				this.pool.query( `SELECT table_name AS \`table\` FROM information_schema.tables${this.config.database ? " WHERE table_schema = ?" : ""};`, this.config.database ? [ this.config.database ] : [] ),
				this.pool.query( `SELECT constraint_name name, table_name table1, column_name column1, referenced_table_name table2, referenced_column_name column2 FROM information_schema.key_column_usage WHERE referenced_table_schema IS NOT NULL${this.config.database ? " AND constraint_schema = ?" : ""};`, this.config.database ? [ this.config.database ] : [] ),
				this.pool.query( `SELECT table_name \`table\`, column_name \`name\`, column_key \`key\` FROM information_schema.columns${this.config.database ? " WHERE table_schema = ?" : ""};`, this.config.database ? [ this.config.database ] : [] )

			] );

			// Reset new collections
			tables.forEach( ( { table } ) => this.collections[ table ] = class extends Model {} );

			// Attach static value
			tables.forEach( ( { table } ) => Object.defineProperties( this.collections[ table ], {
				name: { value: table },
				mfd: { value: this },
				relations: { value: Object.assign(
					constraints
						.filter( relation => relation.table1 === table )
						.reduce( ( relations, relation ) => Object.assign( relations, { [ relation.column1 ]: {
							source: relation.column1,
							target: {
								table: this.collections[ relation.table2 ],
								column: relation.column2
							},
							singleton: true
						} } ), {} ),
					constraints
						.filter( relation => relation.table1 === table || relation.table2 === table )
						.reduce( ( constraints, constraint ) => Object.assign( constraints, { [ constraint.name ]: {
							source: constraint.table1 === table ? constraint.column1 : constraint.column2,
							target: {
								table: this.collections[ constraint.table1 === table ? constraint.table2 : constraint.table1 ],
								column: constraint.table1 === table ? constraint.column2 : constraint.column1
							}
						} } ), {} ) ) },
				key: { value: columns.filter( column => column.table === table && column.key === "PRI" ).map( column => column.name ) },
				columns: { value: columns.filter( column => column.table === table ).map( column => column.name ) }
			} ) );

			// We're done
			delete this.refresh.promise;

		} )() );

	}

	query( ...collections ) {

		const query = new Query( this ).select( ...collections );

		return query;

	}

}
