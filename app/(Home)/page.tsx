import { Menu } from "./menu-client";
import { Suspense } from "react";

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="flex bg-black justify-center items-center min-h-screen">
          <div className="text-white">Loading...</div>
        </div>
      }
    >
      <Menu />
    </Suspense>
  );
}
