import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isSupabaseConfigured } from './lib/supabase.ts'

const root = createRoot(document.getElementById('root')!)

if (!isSupabaseConfigured) {
  // The build that produced this bundle ran without VITE_SUPABASE_URL /
  // VITE_SUPABASE_ANON_KEY, so no Supabase call can succeed. Say so plainly
  // rather than mounting an app that will fail on every request.
  root.render(
    <div className="flex min-h-svh items-center justify-center bg-navy px-4 text-center">
      <div className="max-w-md rounded-lg border border-white/10 bg-panel p-8">
        <h1 className="text-xl font-bold text-white">التطبيق غير مهيّأ</h1>
        <p className="mt-3 text-sm text-muted">
          لم يتم ضبط <span className="font-mono text-amber">VITE_SUPABASE_URL</span> و
          <span className="font-mono text-amber"> VITE_SUPABASE_ANON_KEY</span> أثناء بناء
          النسخة المنشورة. أضِفهما في إعدادات البناء ثم أعد النشر.
        </p>
      </div>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
