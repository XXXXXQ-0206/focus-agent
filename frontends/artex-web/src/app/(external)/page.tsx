import { redirect } from "next/navigation";

// Static export is mounted by the Go server below /artex. Next's server-side
// redirect helper does not prepend basePath when serializing an exported
// redirect, so make the deployment prefix explicit here. Development keeps
// the root route unchanged.
const appBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

export default function Home() {
  redirect(`${appBasePath}/function/tasks`);
  return <>Coming Soon</>;
}
