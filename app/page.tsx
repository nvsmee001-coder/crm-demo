import CRMApp from "@/components/CRMApp";
import { requireChatGPTUser } from "./chatgpt-auth";
import { demoEnabled } from '@/lib/demo-config';
export const dynamic = "force-dynamic";
export default async function Home() { await requireChatGPTUser("/"); return <CRMApp allowDemo={demoEnabled()} />; }
