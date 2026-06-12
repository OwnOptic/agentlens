import { redirect } from 'next/navigation';

// Live (MVP) merged into Overview - which is now the real ARG-driven landing.
export default function LiveRedirect() {
  redirect('/');
}
