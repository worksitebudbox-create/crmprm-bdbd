import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertCircle, ArrowRight, LockKeyhole, Mail } from 'lucide-react';

type LoginPageProps = {
  client: SupabaseClient | null;
  errorMessage?: string;
};

export default function LoginPage({ client, errorMessage }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState('');

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) return;
    setPending('email');
    setError('');
    try {
      const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) setError('Не вдалося увійти. Перевірте пошту та пароль.');
    } catch {
      setError('Не вдалося зв’язатися із сервісом входу. Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setPending(null);
    }
  };

  const signInWithGoogle = async () => {
    if (!client) return;
    setPending('google');
    setError('');
    try {
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      });
      if (signInError) {
        setError('Не вдалося відкрити вхід через Google. Перевірте налаштування провайдера.');
        setPending(null);
      }
    } catch {
      setError('Не вдалося зв’язатися із сервісом входу. Перевірте з’єднання та спробуйте ще раз.');
      setPending(null);
    }
  };

  return <main className="auth-page">
    <section className="auth-card bb-enter" aria-labelledby="auth-title">
      <div className="auth-brand">
        <span className="brand-mark">B</span>
        <span><b>BUDBOX</b><small>CRM / ПРОДАЖІ</small></span>
      </div>
      <div className="auth-heading">
        <span className="auth-icon"><LockKeyhole size={19} /></span>
        <p className="auth-eyebrow">ЗАХИЩЕНИЙ РОБОЧИЙ ПРОСТІР</p>
        <h1 id="auth-title">Вхід до CRM</h1>
        <p>Увійдіть, щоб продовжити роботу з клієнтами та замовленнями.</p>
      </div>
      {(error || errorMessage) && <div className="auth-error" role="alert"><AlertCircle size={16} />{error || errorMessage}</div>}
      {!client && <div className="auth-setup-note"><b>Авторизація ще не налаштована</b><p>Додайте VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY до змінних середовища CRM, а SUPABASE_URL та SUPABASE_ANON_KEY — до API.</p></div>}
      <>
        <button className="auth-google-button" type="button" onClick={() => void signInWithGoogle()} disabled={pending !== null || !client}>
          <svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.04 46.98 31.83 46.98 24.55Z" /><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" /></svg>
          {pending === 'google' ? 'Переходимо до Google…' : 'Продовжити з Google'}
        </button>
        <div className="auth-divider"><span>або увійдіть за поштою</span></div>
        <form className="auth-form" onSubmit={(event) => void submitEmail(event)}>
          <label><span>Електронна пошта</span><span className="auth-input"><Mail size={16} /><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></span></label>
          <label><span>Пароль</span><span className="auth-input"><LockKeyhole size={16} /><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введіть пароль" /></span></label>
          <button className="auth-submit-button" type="submit" disabled={pending !== null || !client}>{pending === 'email' ? 'Входимо…' : <>Увійти до CRM <ArrowRight size={16} /></>}</button>
        </form>
        <p className="auth-help">Немає доступу? Зверніться до адміністратора CRM.</p>
      </>
    </section>
    <aside className="auth-aside" aria-hidden="true">
      <div className="auth-aside-orb auth-aside-orb-one" />
      <div className="auth-aside-orb auth-aside-orb-two" />
      <div className="auth-aside-content"><span className="auth-aside-label">BUDBOX · CRM</span><h2>Усі клієнти<br />в одному місці.</h2><p>Замовлення, оплати та доставка — в єдиному робочому просторі вашої команди.</p><div className="auth-aside-dots"><i /><i /><i /></div></div>
      <span className="auth-aside-footer">ПРОСТО. ЗРУЧНО. BUDBOX.</span>
    </aside>
  </main>;
}
