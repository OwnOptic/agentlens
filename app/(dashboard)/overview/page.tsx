import { redirect } from 'next/navigation';
// Overview lives at the root route "/".
export default function OverviewRedirect() {
  redirect('/');
}
