export default function NovaPoshtaTruck() {
  return (
    <svg
      className="nova-truck-illustration"
      viewBox="0 0 250 120"
      role="img"
      aria-label="Червона вантажівка Нової пошти"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="nova-red" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fa4b4b" />
          <stop offset="1" stopColor="#d71920" />
        </linearGradient>
      </defs>
      <path d="M8 101h229" stroke="#e8e8e8" strokeWidth="3" />
      <path d="M9 105h48M18 111h38" stroke="#ed1c24" strokeLinecap="round" strokeWidth="3" />
      <rect x="63" y="22" width="113" height="63" rx="6" fill="url(#nova-red)" />
      <path d="M176 48h30l24 25v12h-54z" fill="url(#nova-red)" />
      <path d="M187 54h16l17 18h-33z" fill="#252a33" />
      <rect x="226" y="74" width="5" height="9" rx="2" fill="#ffcf3f" />
      <path d="M63 83h167v7H63z" fill="#30343b" />
      <path d="M78 91h137" stroke="#16191e" strokeWidth="4" />
      <circle cx="100" cy="94" r="18" fill="#20242a" />
      <circle cx="100" cy="94" r="10" fill="#aeb4bb" />
      <circle cx="100" cy="94" r="4" fill="#60666d" />
      <circle cx="148" cy="94" r="18" fill="#20242a" />
      <circle cx="148" cy="94" r="10" fill="#aeb4bb" />
      <circle cx="148" cy="94" r="4" fill="#60666d" />
      <circle cx="207" cy="94" r="18" fill="#20242a" />
      <circle cx="207" cy="94" r="10" fill="#aeb4bb" />
      <circle cx="207" cy="94" r="4" fill="#60666d" />
      <path d="m77 47 7-7 7 7-7 7zm7-9v18m-9-9h18" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      <text x="98" y="51" fill="#fff" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="700">НОВА ПОШТА</text>
    </svg>
  );
}
