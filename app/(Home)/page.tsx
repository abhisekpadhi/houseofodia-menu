'use client';

import React, { useEffect } from 'react';
import { Niconne } from 'next/font/google';
import clsx from 'clsx';
import Separator from '../../components/ui/separator';
import _menu from '../../src/data/menu.json';
import axios from 'axios';

const niconne = Niconne({ subsets: ['latin'], weight: '400' });
type TMenuApiItem = {
	category: string;
	name: string;
	description: string;
	price: number;
	is_veg: boolean;
};

type TMenu = {
	[category: string]: Omit<TMenuApiItem, 'category'>[];
};

const Menu: React.FC = () => {
	const [menu, setMenu] = React.useState<TMenu>({});
	const [loading, setLoading] = React.useState<boolean>(true);

	useEffect(() => {
		const fetchMenu = async () => {
			try {
				console.log('>>> fetching menu <<<');
				const response = await axios.get<TMenuApiItem[]>('/api/menu');
				const result: TMenu = {};
				response.data.forEach((item) => {
					if (!result[item.category]) {
						result[item.category] = [];
					}
					result[item.category].push({
						name: item.name,
						description: item.description,
						price: item.price,
						is_veg: item.is_veg,
					});
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
	return (
		<div className='bg-black text-white min-h-screen flex px-4 pt-4'>
			<div className='max-w-lg w-full'>
				<div className='text-center mb-8'>
					<h1
						className={clsx(
							niconne.className,
							'text-4xl font-niconne text-yellow-500'
						)}>
						House Of Odia
					</h1>
					<p className='text-gray-400 mt-2 tracking-wider'>MENU</p>
					<img
						src='/circle_separator.svg'
						alt='separator'
						className='w-6 mx-auto py-2'
					/>
				</div>
				<div className='space-y-8'>
					{Object.keys(menu).map((category) => (
						<MenuItem
							key={category + '_menu'}
							category={category}
							items={menu[category]}
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
		</div>
	);
};

interface MenuItemProps {
	category: string;
	items: {
		name: string;
		description: string;
		price: number;
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
								<img
									src='/veg.svg'
									className='w-6 mx-auto py-2 mx-0'
								/>
							)}
							{!item.is_veg && (
								<img
									src='/non_veg.svg'
									className='w-6 mx-auto py-2'
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
