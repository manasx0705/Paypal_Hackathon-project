import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTitle } from '../lib/useTitle';
import Background from '../components/Background';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <div className="relative min-h-screen grid place-items-center noise p-4">
      <Background />
      <div className="relative z-10 text-center">
        <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[28vw] sm:text-[12rem] font-bold leading-none text-gradient">
          404
        </motion.p>
        <h1 className="font-display text-2xl font-semibold">This aisle is empty.</h1>
        <p className="text-fog-400 mt-2">The page you’re looking for isn’t on our shelves.</p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link to="/" className="btn-ghost">
            Home
          </Link>
          <Link to="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
