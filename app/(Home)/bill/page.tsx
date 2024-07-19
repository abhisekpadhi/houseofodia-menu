'use client';
import React from 'react';
import { FaPrint } from 'react-icons/fa';

const Receipt = () => {
	const handlePrint = () => {
		window.print();
	};

	return (
		<div className='max-w-xs' style={{ maxWidth: '58mm' }}>
			<h2 className='text-center text-xl font-bold mb-2'>
				T A N G I F Y
			</h2>
			<p className='text-center mb-4'>Estimate</p>
			<div className='text-center mb-4'>
				<p>Jeevan Bima Nagar, Indiranagar, Bengaluru, KA - 560075</p>
				<p>7855074030</p>
				<p>FSSAI: 21224010000927</p>
			</div>
			<div className='flex justify-between mb-2'>
				<span>Bill No</span>
				<span>100000000</span>
			</div>
			<div className='flex justify-between mb-4'>
				<span>Date</span>
				<span>24/07/2</span>
				<span>Time</span>
				<span>04:04 PM</span>
			</div>
			<div className='border-t border-b py-2'>
				<div className='flex justify-between mb-2'>
					<span>Qty x Item</span>
					<span>Amount</span>
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
					<span>2x Fish thali</span>
					<span>140</span>
				</div>
				<div className='flex justify-between'>
					<span>Cont. 5 Comp</span>
					<span>140</span>
				</div>
			</div>
			<div className='mt-4'>
				<div className='flex justify-between mb-2'>
					<span>SubTotal</span>
					<span>420</span>
				</div>
				<div className='flex justify-between mb-2'>
					<span>CGST @2.5%</span>
					<span>21</span>
				</div>
				<div className='flex justify-between mb-2'>
					<span>SGST @2.5%</span>
					<span>21</span>
				</div>
				<div className='flex justify-between font-bold'>
					<span>Payable</span>
					<span>462</span>
				</div>
			</div>
			<p className='text-center mt-4'>Thank you. Please visit again.</p>
			<div className='flex justify-center mt-4'>
				<button
					className='bg-green-300 py-2 px-6 rounded-lg flex items-center'
					onClick={handlePrint}>
					<FaPrint className='mr-2' /> PRINT
				</button>
			</div>
		</div>
	);
};

export default Receipt;
