import React from 'react';

const Separator = () => {
	const gradientStyle = {
		background: 'linear-gradient(to right, #FFD700, #000000)',
	};

	return (
		<div className='h-2 rounded-full w-full' style={gradientStyle}></div>
	);
};

export default Separator;
