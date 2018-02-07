
import mysql from "mysql2/promise";

import Model from "./Model.js";
import Query from "./Query.js";

export default class MFD {

	constructor( config ) {

		this.config = Object.assign( { multipleStatements: true }, config );
		this.collections = {};

		this._generate();

	}

	async _generate() {

		const pool = await mysql.createConnection( this.config );
		Object.defineProperty( this, "pool", { value: pool } );

		const [[ tables ], [ constraints ]] = await Promise.all( [
			this.pool.execute( `SELECT table_name AS \`table\` FROM information_schema.tables${this.config.database ? " WHERE table_schema = ?" : ""};`, this.config.database ? [ this.config.database ] : [] ),
			this.pool.execute( `SELECT constraint_name name, table_name table1, column_name column1, referenced_table_name table2, referenced_column_name column2 FROM information_schema.key_column_usage WHERE referenced_table_schema IS NOT NULL${this.config.database ? " AND constraint_schema = ?" : ""};`, this.config.database ? [ this.config.database ] : [] )
		] );

		const relations = {};

		const mdf = this;
		tables.forEach( ( { table } ) => {

			this.collections[ table ] = class extends Model {

				static get name() {

					return table;

				}

				static get relations() {

					return relations[ table ] || ( relations[ table ] = Object.assign(
						constraints
							.filter( relation => relation.table1 === table )
							.reduce( ( relations, relation ) => Object.assign( relations, { [ relation.column1 ]: {
								source: relation.column1,
								target: {
									table: mdf.collections[ relation.table2 ],
									column: relation.column2
								},
								singleton: true
							} } ), {} ),
						constraints
							.filter( relation => relation.table1 === table || relation.table2 === table )
							.reduce( ( constraints, constraint ) => Object.assign( constraints, { [ constraint.name ]: {
								source: constraint.table1 === table ? constraint.column1 : constraint.column2,
								target: {
									table: mdf.collections[ constraint.table1 === table ? constraint.table2 : constraint.table1 ],
									column: constraint.table1 === table ? constraint.column2 : constraint.column1
								}
							} } ), {} ) ) );

				}

			};

		} );

	}

	query( ...collections ) {

		const query = new Query( this ).select( ...collections );

		return query;

	}

}
