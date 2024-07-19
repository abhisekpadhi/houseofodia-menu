'use client';
import React from 'react';
import { FaPrint } from 'react-icons/fa';

const Receipt = () => {
	return (
		<div className='p-4 text-xs' style={{ maxWidth: '58mm' }}>
			<h1 className='text-center font-bold'>T A N G I F Y</h1>
			<p className='text-center'>Estimate</p>
			<p className='text-center'>
				Jeevan Bima Nagar, Indiranagar, Bengaluru, KA - 560075
			</p>
			<p className='text-center'>7855074030</p>
			<p className='text-center'>FSSAI: 21224010000927</p>
			<div className='my-2 border-t border-dashed'></div>
			<div className='flex justify-between'>
				<span>Bill No</span>
				<span>100000000</span>
			</div>
			<div className='flex justify-between'>
				<span>Date</span>
				<span>24/07/2</span>
			</div>
			<div className='flex justify-between'>
				<span>Time</span>
				<span>04:04 PM</span>
			</div>
			<div className='my-2 border-t border-dashed'></div>
			<div>
				<div className='flex justify-between'>
					<span>2x Fish thali</span>
					<span>140</span>
				</div>
				<div className='flex justify-between'>
					<span>2x Fish thali</span>
					<span>140</span>
				</div>
				<div className='flex justify-between'>
					<span>2x Fish thali</span>
					<span>140</span>
				</div>
				<div className='flex justify-between'>
					<span>Cont. 5 Comp</span>
					<span>140</span>
				</div>
			</div>
			<div className='my-2 border-t border-dashed'></div>
			<div className='flex justify-between'>
				<span>SubTotal</span>
				<span>420</span>
			</div>
			<div className='flex justify-between'>
				<span>CGST @2.5%</span>
				<span>21</span>
			</div>
			<div className='flex justify-between'>
				<span>SGST @2.5%</span>
				<span>21</span>
			</div>
			<div className='my-2 border-t border-dashed'></div>
			<div className='flex justify-between font-bold'>
				<span>Payable</span>
				<span>462</span>
			</div>
			<p className='text-center'>Thank you. Please visit again.</p>
			<div className='flex justify-center mt-4 print:hidden'>
				<button
					className='bg-green-300 py-2 px-6 rounded-lg flex items-center w-full justify-center'
					onClick={() => window.print()}>
					<FaPrint className='mr-2' /> PRINT
				</button>
			</div>
		</div>
	);
};

export default Receipt;
