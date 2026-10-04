import { PlaceholderPage } from "@/app/components/placeholder-page";
export default async function ProductPage({ params }: PageProps<"/products/[id]">) { const { id } = await params; return <PlaceholderPage area="Storefront" title="Product detail" description="This will show the selected product when catalogue data is connected." detail={`Requested product ID: ${id}`} />; }
