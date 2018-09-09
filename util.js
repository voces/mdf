
export function flatten( original ) {

	const arr = [];
	for ( let i = 0; i < original.length; i ++ )
		if ( Array.isArray( original[ i ] ) ) arr.push( ...flatten( original[ i ] ) );
		else arr.push( original[ i ] );

	return arr;

}

export const pPush = ( targets, source ) =>
	targets.forEach( ( target, i ) =>
		target.push( ...( Array.isArray( source[ i ] ) ? source[ i ] : [ source[ i ] ] ) ) );
