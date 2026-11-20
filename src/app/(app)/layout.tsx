import { TabBalk } from "@/components/ui/TabBalk";

/** The five tabs share the fixed menu at the bottom. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <TabBalk />
    </>
  );
}
