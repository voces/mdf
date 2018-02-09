
export default class Model {

	constructor( props ) {

		Object.defineProperties( this, Object.assign( {
			_table_source: { writable: true },
			_table_sources: { writable: true },
			_new: { writable: true, value: true },
			_: { value: {} },
			_key: { value: {} }
		}, ...this.constructor.key.map( key => ( {
			[ key ]: {
				set: value => Object.defineProperty( this, key, { value: this._key[ key ] = value } ),
				enumerable: true,
				configurable: true
			}
		} ) ) ) );

		Object.assign( this, props );

	}

	get _mdf() {

		Object.defineProperty( this, "_mdf", { value: this.constructor.mdf } );
		return this._mdf;

	}

	async save() {

		const columnNames = this.constructor.columns;
		const entries = Object.entries( this ).filter( ( [ key ] ) => columnNames.includes( key ) );

		const query = this._new ? "INSERT INTO ?? ( ?? ) VALUES ( ? );" : "UPDATE ?? SET ? WHERE ?;";
		const args = this._new ? [ this.constructor.name, entries.map( entry => entry[ 0 ] ), entries.map( entry => entry[ 1 ] ) ] : [ this.constructor.name, Object.assign( {}, ...entries.map( ( [ key, value ] ) => ( { [ key ]: value } ) ) ), this._key ];

		if ( this._mdf.debug ) console.log( this._mdf.pool.format( query, args ) );

		return this._mdf.pool.query( query, args );

	}

}
