// src/lib/api.ts
// Configuración del cliente API para conectar con el backend

const API_URL = import.meta.env.VITE_API_URL || 'https://tu-app.herokuapp.com/api';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const token = this.getToken();
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(error.error || 'Error en la solicitud');
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  // Hotel
  getHotel = () => this.request<any>('/hotel');
  updateHotel = (data: any) => this.request<any>('/hotel', { method: 'POST', body: data });

  // Tipos Habitación
  getTiposHabitacion = () => this.request<any[]>('/tipos-habitacion');
  createTipoHabitacion = (data: any) => this.request<any>('/tipos-habitacion', { method: 'POST', body: data });
  updateTipoHabitacion = (id: string, data: any) => this.request<any>(`/tipos-habitacion/${id}`, { method: 'PUT', body: data });
  deleteTipoHabitacion = (id: string) => this.request<any>(`/tipos-habitacion/${id}`, { method: 'DELETE' });

  // Habitaciones
  getHabitaciones = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/habitaciones${query}`);
  };
  getHabitacion = (id: string) => this.request<any>(`/habitaciones/${id}`);
  getHabitacionesDisponibles = (checkin: string, checkout: string, tipoId?: string) => {
    const params = new URLSearchParams({ checkin, checkout });
    if (tipoId) params.append('tipo_id', tipoId);
    return this.request<any[]>(`/habitaciones/disponibles?${params}`);
  };
  createHabitacion = (data: any) => this.request<any>('/habitaciones', { method: 'POST', body: data });
  updateHabitacion = (id: string, data: any) => this.request<any>(`/habitaciones/${id}`, { method: 'PUT', body: data });
  updateEstadoHabitacion = (id: string, data: any) => this.request<any>(`/habitaciones/${id}/estado`, { method: 'PATCH', body: data });
  deleteHabitacion = (id: string) => this.request<any>(`/habitaciones/${id}`, { method: 'DELETE' });

  // Clientes
  getClientes = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/clientes${query}`);
  };
  getCliente = (id: string) => this.request<any>(`/clientes/${id}`);
  getClienteReservas = (id: string) => this.request<any[]>(`/clientes/${id}/reservas`);
  createCliente = (data: any) => this.request<any>('/clientes', { method: 'POST', body: data });
  updateCliente = (id: string, data: any) => this.request<any>(`/clientes/${id}`, { method: 'PUT', body: data });
  deleteCliente = (id: string) => this.request<any>(`/clientes/${id}`, { method: 'DELETE' });

  // Reservas
  getReservas = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/reservas${query}`);
  };
  getReserva = (id: string) => this.request<any>(`/reservas/${id}`);
  getCheckinsHoy = () => this.request<any[]>('/reservas/checkins-hoy');
  getCheckoutsHoy = () => this.request<any[]>('/reservas/checkouts-hoy');
  createReserva = (data: any) => this.request<any>('/reservas', { method: 'POST', body: data });
  updateReserva = (id: string, data: any) => this.request<any>(`/reservas/${id}`, { method: 'PUT', body: data });
  checkin = (id: string, habitacionId?: string) => this.request<any>(`/reservas/${id}/checkin`, { method: 'POST', body: { habitacion_id: habitacionId } });
  checkout = (id: string) => this.request<any>(`/reservas/${id}/checkout`, { method: 'POST' });
  cancelarReserva = (id: string, motivo?: string) => this.request<any>(`/reservas/${id}/cancelar`, { method: 'POST', body: { motivo } });
  confirmarReserva = (id: string) => this.request<any>(`/reservas/${id}/confirmar`, { method: 'PATCH' });

  // Pagos
  getPagos = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/pagos${query}`);
  };
  getPagosReserva = (reservaId: string) => this.request<any[]>(`/pagos/reserva/${reservaId}`);
  createPago = (data: any) => this.request<any>('/pagos', { method: 'POST', body: data });
  deletePago = (id: string) => this.request<any>(`/pagos/${id}`, { method: 'DELETE' });

  // Limpieza
  getTareasLimpieza = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/limpieza${query}`);
  };
  getTareasLimpiezaHoy = () => this.request<any[]>('/limpieza/hoy');
  createTareaLimpieza = (data: any) => this.request<any>('/limpieza', { method: 'POST', body: data });
  updateEstadoLimpieza = (id: string, estado: string) => this.request<any>(`/limpieza/${id}/estado`, { method: 'PATCH', body: { estado } });
  asignarLimpieza = (id: string, asignadoA: string, asignadoNombre: string) => 
    this.request<any>(`/limpieza/${id}/asignar`, { method: 'PUT', body: { asignado_a: asignadoA, asignado_nombre: asignadoNombre } });
  deleteTareaLimpieza = (id: string) => this.request<any>(`/limpieza/${id}`, { method: 'DELETE' });

  // Mantenimiento
  getTareasMantenimiento = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/mantenimiento${query}`);
  };
  getTareasMantenimientoPendientes = () => this.request<any[]>('/mantenimiento/pendientes');
  createTareaMantenimiento = (data: any) => this.request<any>('/mantenimiento', { method: 'POST', body: data });
  updateTareaMantenimiento = (id: string, data: any) => this.request<any>(`/mantenimiento/${id}`, { method: 'PUT', body: data });
  updateEstadoMantenimiento = (id: string, estado: string, costoReal?: number) => 
    this.request<any>(`/mantenimiento/${id}/estado`, { method: 'PATCH', body: { estado, costo_real: costoReal } });
  deleteTareaMantenimiento = (id: string) => this.request<any>(`/mantenimiento/${id}`, { method: 'DELETE' });

  // Productos
  getCategorias = () => this.request<any[]>('/productos/categorias');
  createCategoria = (data: any) => this.request<any>('/productos/categorias', { method: 'POST', body: data });
  getProductos = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/productos${query}`);
  };
  getProducto = (id: string) => this.request<any>(`/productos/${id}`);
  createProducto = (data: any) => this.request<any>('/productos', { method: 'POST', body: data });
  updateProducto = (id: string, data: any) => this.request<any>(`/productos/${id}`, { method: 'PUT', body: data });
  deleteProducto = (id: string) => this.request<any>(`/productos/${id}`, { method: 'DELETE' });
  movimientoInventario = (id: string, data: any) => this.request<any>(`/productos/${id}/movimiento`, { method: 'POST', body: data });
  getMovimientosProducto = (id: string) => this.request<any[]>(`/productos/${id}/movimientos`);
  cargoHabitacion = (data: any) => this.request<any>('/productos/cargo-habitacion', { method: 'POST', body: data });

  // Gastos
  getGastos = (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/gastos${query}`);
  };
  getGasto = (id: string) => this.request<any>(`/gastos/${id}`);
  getCategoriasGastos = () => this.request<string[]>('/gastos/categorias');
  getResumenGastos = (fechaDesde: string, fechaHasta: string) => 
    this.request<any>(`/gastos/resumen?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`);
  createGasto = (data: any) => this.request<any>('/gastos', { method: 'POST', body: data });
  updateGasto = (id: string, data: any) => this.request<any>(`/gastos/${id}`, { method: 'PUT', body: data });
  deleteGasto = (id: string) => this.request<any>(`/gastos/${id}`, { method: 'DELETE' });

  // Dashboard
  getDashboardStats = () => this.request<any>('/dashboard/stats');
  getDashboardCheckinsHoy = () => this.request<any[]>('/dashboard/checkins-hoy');
  getDashboardCheckoutsHoy = () => this.request<any[]>('/dashboard/checkouts-hoy');
  getDashboardVentasHoy = () => this.request<any>('/dashboard/ventas-hoy');
  getDashboardTareasCriticas = () => this.request<any>('/dashboard/tareas-criticas');
  getDashboardOcupacionTipo = () => this.request<any[]>('/dashboard/ocupacion-tipo');
  getDashboardIngresosMes = () => this.request<any>('/dashboard/ingresos-mes');
  getDashboardResumenSemanal = () => this.request<any>('/dashboard/resumen-semanal');
}

export const api = new ApiClient();
export default api;
