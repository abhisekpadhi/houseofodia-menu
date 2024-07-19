'use client';
import React, { useState } from 'react';
import { FaPrint } from 'react-icons/fa';

const BillScreen = () => {
	const [selectedItems, setSelectedItems] = useState([]);
	const items = Array(9).fill({ name: 'Andhra non veg thali', price: 140 });

	const handleItemClick = (index) => {
		setSelectedItems((prev) =>
			prev.includes(index)
				? prev.filter((i) => i !== index)
				: [...prev, index]
		);
	};

	const handlePrint = () => {
		window.print();
	};

	const totalAmount = selectedItems.reduce(
		(acc, index) => acc + items[index].price,
		0
	);

	return (
		<div className='p-4'>
			<div className='grid grid-cols-3 gap-4 mb-4'>
				{items.map((item, index) => (
					<div
						key={index}
						className={`p-4 text-center cursor-pointer ${
							selectedItems.includes(index)
								? 'bg-green-300'
								: 'bg-gray-300'
						}`}
						onClick={() => handleItemClick(index)}>
						<p>{item.name}</p>
						<p>{item.price}</p>
					</div>
				))}
			</div>
			<div className='flex justify-center mt-4'>
				<button
					className='bg-green-300 py-2 px-6 rounded-lg flex items-center w-full justify-center'
					onClick={handlePrint}>
					<FaPrint className='mr-2' /> Rs.{totalAmount} MAKE BILL
				</button>
			</div>
		</div>
	);
};

export default BillScreen;
