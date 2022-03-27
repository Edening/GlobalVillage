/*
 * @Author: zouyaoji@https://github.com/zouyaoji
 * @Date: 2021-09-06 16:52:09
 * @LastEditTime: 2022-01-10 17:17:56
 * @LastEditors: zouyaoji
 * @Description:
 * @FilePath: \vue-cesium-demo\src\store\modules\system\permission.ts
 */

import constantRoutes, { frameInRoutes } from '@src/router/routes'
import mainLayout from '@src/layouts/MainLayout.vue'
import router from '@src/router'
import { menuHeader } from '@src/config/menu'
import * as logger from '@src/utils/logger'
import * as util from '@src/utils/util'
import { Menu } from '@src/api/modules/system'
// const defaultMenu = import.meta.env.VITE_VUE_APP_MENU_DEFAULT as string

const StaticMenuHeader = [...menuHeader] // 静态菜单暂存，重新登录后，需要重新加载动态菜单与此处的静态菜单合并

function isEmpty(value) {
  if (value == null || value === '') {
    return true
  }
  return false
}
const pages = import.meta.globEager('../../../pages/**/*.vue')
const resolveComponent = path => {
  const importPage = pages[`../../../pages${path}/Index.vue`]

  if (!importPage) {
    logger.warn(`动态路由页面【${path}】加载失败。请检查页面文件是否存在。`)
    return undefined
    // throw new Error(`Unknown page ${name}. Is it located under Pages with a .vue extension?`)
  }

  return importPage.default
}

/**
 * 构建路由列表
 * menuType 1=menu 2=btn 3=route
 * @param routers
 * @param list
 * @returns {[]}
 */
function buildRouter(parent, list) {
  if (parent == null) {
    parent = { children: [] }
  }
  list.forEach(item => {
    let newRouter = parent
    if (item.type !== 20 && !isEmpty(item.component)) {
      // 如果是按钮 或者没有配置component，则不加入路由
      let component: any = null
      if (item.component === 'MainLayout') {
        component = mainLayout
      } else {
        // vite 中动态导入别名不能用别名，只能用相对路径
        // https://github.com/rollup/plugins/tree/master/packages/dynamic-import-vars#limitations
        // component = () => import(`../../../pages${item.path}/index.vue`)
        component = resolveComponent(item.path)
      }
      const children = parent.children
      newRouter = {
        path: item.path,
        name: item.name,
        hidden: item.hidden,
        // 动态路由支持懒加载
        component: component,
        meta: {
          title: item.title,
          auth: true,
          cache: true
        }
      }
      children.push(newRouter)
    }
    if (item.children != null && item.children.length > 0) {
      if (newRouter.children == null) {
        newRouter.children = []
      }
      buildRouter(newRouter, item.children)
    }
  })

  return parent.children
}

/**
 * 构建权限码列表
 * @param menuTree
 * @param permissionList
 * @returns {*}
 */
function buildPermissions(menuTree, permissionList) {
  if (menuTree == null) {
    menuTree = []
  }
  menuTree.forEach(item => {
    if (item.permission != null && item.permission !== '') {
      // 权限为空
      permissionList.push(item.permission)
    }
    if (item.children != null && item.children.length > 0) {
      buildPermissions(item.children, permissionList)
    }
  })
  return permissionList
}

/**
 * 构建菜单
 * @param menuTree
 * @returns {[]}
 */
function buildMenu(menuTree) {
  if (menuTree == null) {
    menuTree = []
  }
  let menus: Array<Menu> = []
  menuTree.forEach(item => {
    if (item.type !== 10) {
      // 只有菜单类型才加入
      return
    }
    let children
    if (item.children != null && item.children.length > 0) {
      children = buildMenu(item.children)
    }
    let icon
    if (item.icon != null && item.icon !== '') {
      icon = item.icon
    }
    menus.push({ ...item })
  })
  if (menus.length === 0) {
    menus = undefined
  }
  return menus
}

const state = {
  routes: [],
  addRoutes: [],
  permissions: [],
  inited: false
}

const mutations = {
  setRoutes: (state, { accessedRoutes: routes, permissions }) => {
    state.addRoutes = routes
    state.routes = constantRoutes.concat(routes)
    state.inited = true
    state.permissions = permissions
  },
  clear: () => {
    state.addRoutes = []
    state.routes = []
    state.inited = false
    state.permissions = []
  }
}

const actions = {
  generateRoutes({ rootState, state, commit }, { menuTree }) {
    return new Promise(resolve => {
      // 处理路由
      const accessedRoutes = buildRouter(null, menuTree) // 根据后台获取到的资源树构建路由列表
      const permissions = buildPermissions(menuTree, []) // 从资源树中抽取权限code列表
      commit('setRoutes', { accessedRoutes, permissions }) // 将菜单和权限存储到vuex里面
      accessedRoutes.forEach(route => {
        if (route.name === 'layout' && route.path === '/') {
          route.children = route.children.concat(frameInRoutes[0].children)
        }
        router.addRoute(route)
      }) // 添加动态路由
      // 处理菜单
      const menus = util.supplementPath(buildMenu(menuTree)) // 根据后台获取的资源树，构建菜单
      menuHeader.splice(0, menuHeader.length)
      menuHeader.push(...StaticMenuHeader) // 重新构建菜单列表
      menuHeader.push(...menus) // 将动态菜单放进去

      // 重新设置顶栏菜单
      commit('system/menu/headerSet', menuHeader, { root: true })
      // 重新设置侧边栏菜单
      if (rootState.system.menu.asideSet == null) {
        // let menuDefault = defaultMenu
        // console.log(defaultMenu)
        // if (menuDefault == null) {
        //   logger.warn(`VITE_VUE_APP_MENU_DEFAULT=${defaultMenu}`)
        //   menuDefault = (menuHeader.length - 1).toString()
        // }
        // const defaultMenuIndex = parseInt(menuDefault)
        // if (defaultMenuIndex >= 0) {
        //   const menus = menuHeader[defaultMenuIndex].children || []
        //   logger.debug('加载菜单成功：第', defaultMenuIndex, '个, 菜单数据：', menus)
        //   commit('system/menu/asideSet', menus, { root: true })
        // }
      }
      // 重新初始化菜单搜索功能
      commit('system/search/init', menuHeader, { root: true })

      resolve(true)
    })
  },
  async getAccessibleMenus({ state, dispatch }) {
    //
  },
  clear({ commit }) {
    commit('clear')
  }
}

const getters = {
  inited(state) {
    return state.inited
  },
  permissions(state) {
    return state.permissions
  }
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
}