import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { listNotifications, markAllRead, markRead } from '../api/notifications';
import { qk } from '../lib/queryKeys';
import { timeAgo } from '../lib/format';
import { Drawer, EmptyState, ErrorState, SkeletonRows } from './ui';

const REF_ROUTES = { order: '/orders/', alert: '/alerts/', trend: '/trends/', run: '/agent', agentrun: '/agent', cart: '/cart', product: '/inventory' };
function routeFor(n) {
  const t = String(n.refType || '').toLowerCase().replace(/[^a-z]/g, '');
  const base = REF_ROUTES[t];
  if (!base) return null;
  return base.endsWith('/') && n.refId ? base + n.refId : base.replace(/\/$/, '');
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: qk.notifications, queryFn: () => listNotifications(), refetchInterval: 60_000 });
  const inv = () => qc.invalidateQueries({ queryKey: qk.notifications });
  const one = useMutation({ mutationFn: markRead, onSuccess: inv });
  const all = useMutation({ mutationFn: markAllRead, onSuccess: inv });
  const unread = q.data?.unreadCount || 0;
  const items = q.data?.items || [];
  return (
    <>
      <button onClick={() => setOpen(true)} className="relative p-2 rounded-xl hover:bg-white/10" aria-label={`Notifications, ${unread} unread`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-saffron-500 text-ink-950 text-[10px] font-bold grid place-items-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Notifications" width="max-w-md">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-fog-400">{unread} unread</p>
          <button className="btn-ghost btn-sm" disabled={!unread || all.isPending} onClick={() => all.mutate()}>
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
          </button>
        </div>
        {q.isLoading ? (
          <SkeletonRows rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : !items.length ? (
          <EmptyState icon={Bell} title="All quiet" body="Low-stock warnings, new suggestions and price alerts will show up here." />
        ) : (
          <ul className="space-y-2">
            {items.map((n) => {
              const to = routeFor(n);
              return (
                <li key={n._id} className={clsx('rounded-xl p-3 border', n.readAt ? 'border-white/5 bg-white/[0.02]' : 'border-saffron-400/30 bg-saffron-400/[0.06]')}>
                  <div className="flex gap-3">
                    <span className={clsx('mt-1.5 h-2 w-2 rounded-full shrink-0', n.readAt ? 'bg-white/20' : 'bg-saffron-400')} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-fog-500">
                        {String(n.type || '').replace(/_/g, ' ')} · {timeAgo(n.createdAt)} {!n.readAt && <span className="sr-only">(unread)</span>}
                      </p>
                      {to ? (
                        <button
                          className="text-left text-sm text-fog-100 hover:underline"
                          onClick={() => {
                            if (!n.readAt) one.mutate(n._id);
                            setOpen(false);
                            nav(to);
                          }}
                        >
                          {n.message}
                        </button>
                      ) : (
                        <p className="text-sm text-fog-100">{n.message}</p>
                      )}
                    </div>
                    {!n.readAt && (
                      <button className="p-1.5 rounded-lg hover:bg-white/10 self-start" aria-label="Mark as read" onClick={() => one.mutate(n._id)}>
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Drawer>
    </>
  );
}
