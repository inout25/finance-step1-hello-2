import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('Supabase URL:', url)
console.log('Anon key loaded:', key ? key.slice(0, 8) + '…' : 'MISSING')

export const supabase = createClient(url, key)
