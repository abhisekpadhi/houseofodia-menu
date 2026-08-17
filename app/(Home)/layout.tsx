import { HomeProviders } from './providers';

export default function HomeLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <HomeProviders>{children}</HomeProviders>;
}
