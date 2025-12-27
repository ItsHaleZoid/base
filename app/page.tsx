import { CreditCard, Wifi } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="grid md:grid-cols-2 gap-8 max-w-4xl w-full">
        
        {/* Primary Card - Blue Gradient */}
        <div className="relative w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 p-6 flex flex-col justify-between text-white shadow-xl">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-80 uppercase tracking-wider">Card Type</span>
              <span className="text-sm font-medium">Personal</span>
            </div>
            <Wifi className="w-6 h-6 rotate-90" />
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="w-12 h-9 rounded bg-gradient-to-br from-yellow-200 to-yellow-400 opacity-90" />
            
            <div className="flex flex-col gap-1">
              <span className="text-lg tracking-[0.2em] font-mono">4532  1234  5678  9010</span>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Cardholder</span>
                <span className="text-sm font-medium">John Anderson</span>
              </div>
              
              <div className="flex flex-col gap-1 items-end">
                <span className="text-xs opacity-80">Expires</span>
                <span className="text-sm font-medium font-mono">12/28</span>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Card - Purple Gradient */}
        <div className="relative w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-700 p-6 flex flex-col justify-between text-white shadow-xl">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-80 uppercase tracking-wider">Card Type</span>
              <span className="text-sm font-medium">Business</span>
            </div>
            <Wifi className="w-6 h-6 rotate-90" />
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="w-12 h-9 rounded bg-gradient-to-br from-yellow-200 to-yellow-400 opacity-90" />
            
            <div className="flex flex-col gap-1">
              <span className="text-lg tracking-[0.2em] font-mono">5412  8765  4321  0987</span>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Cardholder</span>
                <span className="text-sm font-medium">Sarah Mitchell</span>
              </div>
              
              <div className="flex flex-col gap-1 items-end">
                <span className="text-xs opacity-80">Expires</span>
                <span className="text-sm font-mono">09/27</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tertiary Card - Dark Gradient */}
        <div className="relative w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-black p-6 flex flex-col justify-between text-white shadow-xl">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-80 uppercase tracking-wider">Card Type</span>
              <span className="text-sm font-medium">Premium</span>
            </div>
            <Wifi className="w-6 h-6 rotate-90" />
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="w-12 h-9 rounded bg-gradient-to-br from-yellow-200 to-yellow-400 opacity-90" />
            
            <div className="flex flex-col gap-1">
              <span className="text-lg tracking-[0.2em] font-mono">6011  2345  6789  0123</span>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Cardholder</span>
                <span className="text-sm font-medium">Alex Chen</span>
              </div>
              
              <div className="flex flex-col gap-1 items-end">
                <span className="text-xs opacity-80">Expires</span>
                <span className="text-sm font-mono">03/29</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quaternary Card - Teal Gradient */}
        <div className="relative w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-700 p-6 flex flex-col justify-between text-white shadow-xl">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-80 uppercase tracking-wider">Card Type</span>
              <span className="text-sm font-medium">Student</span>
            </div>
            <Wifi className="w-6 h-6 rotate-90" />
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="w-12 h-9 rounded bg-gradient-to-br from-yellow-200 to-yellow-400 opacity-90" />
            
            <div className="flex flex-col gap-1">
              <span className="text-lg tracking-[0.2em] font-mono">3782  8224  6310  005</span>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Cardholder</span>
                <span className="text-sm font-medium">Emily Rodriguez</span>
              </div>
              
              <div className="flex flex-col gap-1 items-end">
                <span className="text-xs opacity-80">Expires</span>
                <span className="text-sm font-mono">06/26</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}