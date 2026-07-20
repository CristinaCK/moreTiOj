import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

let refreshPromise = null

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error
    const refresh = localStorage.getItem('refresh')
    if (response && response.status === 401 && refresh && !config._retried) {
      config._retried = true
      try {
        refreshPromise =
          refreshPromise ||
          axios.post('/api/auth/token/refresh/', { refresh })
        const { data } = await refreshPromise
        refreshPromise = null
        localStorage.setItem('access', data.access)
        config.headers.Authorization = `Bearer ${data.access}`
        return client(config)
      } catch (e) {
        refreshPromise = null
        localStorage.removeItem('access')
        localStorage.removeItem('refresh')
      }
    }
    return Promise.reject(error)
  }
)

export default client
