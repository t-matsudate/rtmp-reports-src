import Vue from 'vue'
import VueRouter from 'vue-router'
import App from './App.vue'
import Overview from './components/articles/Overview.vue'
import NotFound from './components/articles/NotFound.vue'
import Index from './components/Index.vue'

Vue.use(VueRouter)
Vue.config.productionTip = false

const routes = [
  {
    path: '/rtmp-reports',
    component: Index,
  },
  {
    path: '/rtmp-reports/overview',
    component: Overview
  },
  {
    path: '/rtmp-reports/*',
    component: NotFound
  }
]

const router = new VueRouter({
  routes,
  mode: 'history'
})

new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
