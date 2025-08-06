// src/config/vendorsConfig.js
export const VENDORS = [
  {
    name: 'Tomás',
    role: 'CEO/Head of Sales',
    email: 'tomas@ventapel.com.br',
    style: 'Estratégico - Deals grandes, negociación C-level',
    strengths: ['Estrategia', 'ROI', 'C-Suite'],
    is_admin: true,
    active: true
  },
  {
    name: 'Jordi',
    role: 'Sales Manager',
    email: 'jordi@ventapel.com.br',
    style: 'Metódico - Proceso PPVVCC, técnico',
    strengths: ['Metodología', 'Demos', 'Proceso'],
    is_admin: false,
    active: true
  },
  {
    name: 'Victor Hugo',
    role: 'Account Executive',
    email: 'victor@ventapel.com.br',
    style: 'Hunter - Nuevas cuentas, desarrollo de mercado',
    strengths: ['Prospección', 'Apertura', 'Nuevos mercados'],
    is_admin: false,
    active: true
  },
  {
    name: 'Renata',
    role: 'Account Executive',
    email: 'renata@ventapel.com.br',
    style: 'Consultiva - Relaciones, cuentas estratégicas',
    strengths: ['Relaciones', 'Consultiva', 'Key accounts'],
    is_admin: false,
    active: true
  },
  {
    name: 'Paulo',
    role: 'Account Executive',
    email: 'paulo@ventapel.com.br',
    style: 'Técnico - Soluciones complejas, industria',
    strengths: ['Técnico', 'Industria', 'Soluciones'],
    is_admin: false,
    active: true
  },
  {
    name: 'Carlos',
    role: 'Account Executive',
    email: 'carlos@ventapel.com.br',
    style: 'Farmer - Cuentas existentes, expansión',
    strengths: ['Farming', 'Upsell', 'Retención'],
    is_admin: false,
    active: true
  }
];

// Función helper para obtener vendedor por nombre
export const getVendorByName = (name) => {
  return VENDORS.find(v => v.name === name) || {
    name,
    role: 'Vendedor',
    is_admin: false
  };
};

// Función para obtener solo vendedores activos
export const getActiveVendors = () => {
  return VENDORS.filter(v => v.active);
};

// Función para verificar si es admin
export const isAdmin = (vendorName) => {
  const vendor = VENDORS.find(v => v.name === vendorName);
  return vendor?.is_admin || false;
};
