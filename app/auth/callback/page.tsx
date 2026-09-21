import { Suspense } from "react";
import { AuthCallbackClient } from "./auth-callback-client";
export default function AuthCallbackPage() { return <Suspense fallback={<main className="auth-callback"><p>AUTHENTICATION</p><h1>Opening secure sign in</h1></main>}><AuthCallbackClient/></Suspense>; }
