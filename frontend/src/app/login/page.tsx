export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[360px]">
        <p className="text-[15px] font-semibold tracking-tight">
          yuicry<span className="text-accent">.</span>
        </p>

        <h1 className="mt-6 text-[26px] font-medium leading-tight tracking-tight">
          Вход через OwaID
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Пароль и почту вводишь на owaw.ru. yuicry получает только имя и аватар.
        </p>

        <a
          href="/api/auth/login"
          className="mt-8 block rounded-md bg-accent px-4 py-3 text-center text-[13px] font-medium text-accentText hover:brightness-110"
        >
          Продолжить
        </a>

        <a
          href="/"
          className="mt-4 block text-center text-[12px] text-muted hover:text-ink"
        >
          На главную
        </a>
      </div>
    </div>
  );
}
