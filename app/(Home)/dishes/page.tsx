import { DishesScreen } from "./dishes-client";
import { Suspense } from "react";

export default function DishesPage() {
  return (
    <Suspense fallback={null}>
      <DishesScreen />
    </Suspense>
  );
}
