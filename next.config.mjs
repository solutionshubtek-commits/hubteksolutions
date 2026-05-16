/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
      return [
        {
          // Aplica em todas as rotas
          source: '/(.*)',
          headers: [
            // Impede que a página seja carregada em iframes (clickjacking)
            { key: 'X-Frame-Options', value: 'DENY' },
            // Impede que o browser "adivinhe" o content-type (MIME sniffing)
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            // Não envia o referrer ao sair do domínio
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            // Desativa features do browser que não usamos
            {
              key: 'Permissions-Policy',
              value: 'camera=(), microphone=(self), geolocation=(), payment=()',
            },
            // Força HTTPS por 1 ano (só ativo em produção, mas não causa dano em dev)
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=31536000; includeSubDomains',
            },
            // Evita XSS via Content-Security-Policy básico
            // Permite: same-origin, Supabase, Evolution API, WhatsApp CDN
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-* necessário para Next.js
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob: https://*.supabase.co https://supabase.co",
                "font-src 'self' data:",
                "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.hubteksolutions.tech https://api.anthropic.com https://api.openai.com https://api.resend.com",
                "media-src 'self' blob: https://*.supabase.co",
                "frame-ancestors 'none'",
              ].join('; '),
            },
          ],
        },
      ]
    },
  }
  
  export default nextConfig