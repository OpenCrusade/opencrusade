import { RouterProvider } from "react-router-dom";
import { DialogHelp } from "@/components/common/DialogHelp";
import { Toasts } from "@/components/common/Toasts";
import { Providers } from "./providers";
import { router } from "./routes";

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
      <Toasts />
      <DialogHelp />
    </Providers>
  );
}
