'use client';

import axios from 'axios';
import clsx from 'clsx';
import { Niconne } from 'next/font/google';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Separator from '@/components/ui/separator';
import { TMenu, TMenuApiItem } from '@/src/models/common';

const niconne = Niconne({ subsets: ['latin'], weight: '400' });



const Menu: React.FC = () => {
	const params = useSearchParams();
	const [searchTerm, setSearchTerm] = useState('');
	const [menu, setMenu] = React.useState<TMenu>({});
	const [loading, setLoading] = React.useState<boolean>(true);
	const [isWithLocation, setIsWithLocation] = React.useState<boolean>();

	useEffect(() => {
		if (params.get('with_location')) {
			setIsWithLocation(
				params.get('with_location').toLowerCase() === 'true'
			);
		}
	}, []);

	useEffect(() => {
		const fetchMenu = async () => {
			try {

				const response = await axios.get<TMenuApiItem[]>('/api/menu');
				const result: TMenu = {};
				response.data.forEach((item) => {
					if (!result[item.category]) {
						result[item.category] = [];
					}
					// only show menu items that are switched on
					if (item.status.toLowerCase() === 'on') {
						result[item.category].push({
							status: item.status,
							name: item.name,
							description: item.description,
							price: item.price,
							is_veg: item.is_veg,
						});
					}
				});
				setMenu(result);
				setLoading(false);
			} catch (error) {
				console.error('Error fetching menu:', error);
				alert('Error fetching menu: ' + error);
			} finally {
				setLoading(false);
			}
		};
		fetchMenu().then((_) => {});
	}, []);
	if (loading) {
		return (
			<div className='flex bg-black justify-center items-center min-h-screen'>
				<div className='text-white'>Loading...</div>
			</div>
		);
	}
	const changeSearchTerm = (e: any) => {
	    e.preventDefault();
		setSearchTerm(e.target.value);
	};
	return (
		<div className='bg-black text-white min-h-screen flex px-4 pt-4'>
			<div className='max-w-lg w-full'>
				<div className='text-center mb-8'>
					<h1
						className={clsx(
							niconne.className,
							'text-4xl font-niconne text-yellow-500'
						)}>
						Menu
					</h1>
					{/* <p className='text-gray-400 mt-2 tracking-wider'>MENU</p> */}
					<img
						src='/circle_separator.svg'
						alt='separator'
						className='w-6 mx-auto py-2'
					/>
				</div>
				<div className='space-y-8'>
					<div className="relative w-full">
						<input
							className="w-full p-3 ps-10 text-sm rounded-lg bg-gray-800  text-white placeholder-gray-400 border-none outline-none focus:none"
							type="text"
							placeholder="Search menu items..."
							value={searchTerm}
							onChange={changeSearchTerm}
						/>
						{searchTerm && (
							<button
								onClick={() => setSearchTerm('')}
								className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 text-white px-4 py-2 rounded-lg hover:text-red-500 hover:bg-transparent hover:border-red-500"
							>
								Cancel
							</button>
						)}
					</div>
					{Object.keys(menu).map((category) => (
						<MenuItem
							key={category + '_menu'}
							category={category}
							items={menu[category].filter(item => 
								item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
								item.description.toLowerCase().includes(searchTerm.toLowerCase())
							)}
						/>
					))}
					{/* <MenuItem
						category='Thali'
						items={[
							{
								name: 'Veg thali',
								description:
									'Rice, dal, rasam, curd & sweet, Rice, dal, rasam, curd & sweet, Rice, dal, rasam, curd & sweet',
								price: 120,
							},
							{
								name: 'Non-veg thali',
								description: 'Rice, dal, rasam, curd & sweet',
								price: 180,
							},
						]}
					/>
				*/}
				</div>
				<img
					src='/circle_separator.svg'
					alt='separator'
					className='w-8 mx-auto py-10'
				/>
			</div>
			{isWithLocation && (
				<button
					onClick={() => {
						window.open(
							'https://maps.app.goo.gl/CioXF1YvSARA8KwP7'
						);
					}}
					className='bg-white text-black font-bold text-lg py-2 px-4 rounded-full md:w-fit fixed bottom-5 flex justify-center items-center'>
					<img
						src='/gmap.svg'
						alt='separator'
						className='w-6 mx-auto mr-2 py-1'
					/>
					Location of restaurant
				</button>
			)}
		</div>
	);
};

interface MenuItemProps {
	category: string;
	items: {
		name: string;
		description: string;
		price: string;
		is_veg: boolean;
	}[];
}

const MenuItem: React.FC<MenuItemProps> = ({ category, items }) => {
	return (
		<div key={category}>
			<h2 className='text-yellow-500 mb-2 uppercase'>{category}</h2>
			<Separator />
			{items.map((item, index) => (
				<div
					key={category + index}
					className='flex justify-between items-center border-b border-gray-700 py-2'>
					<div className='flex pr-2 flex-col'>
						<div className='flex items-center'>
							{item.is_veg && (
								<img src='/veg.svg' className='w-6 py-2 mx-0' />
							)}
							{!item.is_veg && (
								<img
									src='/non_veg.svg'
									className='w-6 mx-0 py-2'
								/>
							)}
							<h3 className='font-semibold ml-2'>{item.name}</h3>
						</div>
						<div>
							<p className='text-gray-400 text-sm'>
								{item.description}
							</p>
						</div>
					</div>
					<div className='text-yellow-500 font-bold'>
						{item.price}
					</div>
				</div>
			))}
		</div>
	);
};

export default Menu;
