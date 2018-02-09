
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

	get _mfd() {

		Object.defineProperty( this, "_mfd", { value: this.constructor.mfd } );
		return this._mfd;

	}

	async save() {

		const columnNames = this.constructor.columns;
		const entries = Object.entries( this ).filter( ( [ key ] ) => columnNames.includes( key ) );

		const query = this._new ? "INSERT INTO ?? ( ?? ) VALUES ( ? );" : "UPDATE ?? SET ? WHERE ?;";
		const args = this._new ? [ this.constructor.name, entries.map( entry => entry[ 0 ] ), entries.map( entry => entry[ 1 ] ) ] : [ this.constructor.name, Object.assign( {}, ...entries.map( ( [ key, value ] ) => ( { [ key ]: value } ) ) ), this._key ];

		if ( this._mfd.debug ) console.log( this._mfd.pool.format( query, args ) );

		return this._mfd.pool.query( query, args );

	}

}
