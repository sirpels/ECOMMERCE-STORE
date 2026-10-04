import { PlaceholderPage } from "@/app/components/placeholder-page";
export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) { const { id } = await params; return <PlaceholderPage area="Admin" title="Edit product" description="This will provide the form for editing a catalogue product." detail={`Requested product ID: ${id}`} />; }
