'use client';

import dynamic from 'next/dynamic';

const Game = dynamic(() => import('@/components/Game'), { 
  ssr: false,
  loading: () => <div className="text-white">Loading Agent World...</div>
});

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 bg-gray-900 text-white">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Agent World 2D Dashboard
        </p>
      </div>

      <div className="relative flex place-items-center">
        <Game />
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
        {/* Footer info placeholder */}
      </div>
    </main>
  );
}
