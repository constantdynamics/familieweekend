import type { Metadata } from "next";
import { WelkomScherm } from "@/components/welkom/WelkomScherm";

export const metadata: Metadata = {
  title: { absolute: "De Valkenburger Spelen 2027" },
};

export default function WelkomPage() {
  return <WelkomScherm />;
}
