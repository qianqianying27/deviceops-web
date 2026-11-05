import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import DeviceView from './views/DeviceView.vue';
import AlertsView from './views/AlertsView.vue';
import AssistantView from './views/AssistantView.vue';
import UsersView from './views/UsersView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/', component: DashboardView },
    { path: '/devices/:sn', component: DeviceView },
    { path: '/alerts', component: AlertsView },
    { path: '/assistant', component: AssistantView },
    { path: '/users', component: UsersView },
  ],
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !getToken()) {
    return { path: '/login' };
  }
  if (to.path === '/login' && getToken()) {
    return { path: '/' };
  }
  return true;
});
