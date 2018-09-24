
import assert from "assert";
import ZQL from "../ZQL.js";

describe( "#constructor", () => {

	describe( ".spec", () => {

		it( "throws on non-objects", () => assert.throws( () => new ZQL( { spec: "abc" } ), /should be an object/ ) );

		it( "sets if passed", () => {

			const spec = { abc: 123 };

			const zql = new ZQL( { spec } );

			assert.equal( zql.spec, spec );
			assert.deepEqual( zql.specTables, [ 123 ] );

		} );

	} );

	describe( ".query", () => {

		it( "sets if passed", () => {

			const query = () => {};
			const zql = new ZQL( { query } );
			assert.equal( zql._query, query );

		} );

	} );

} );

