import PropertyForm, { EMPTY } from "@/components/properties/PropertyForm";
import { PageHeader } from "@/components/ui";

export default function NewProperty() {
  return (<><PageHeader title="Add property" subtitle="Save as a draft first, then add photos and documents." /><PropertyForm initial={EMPTY} /></>);
}
