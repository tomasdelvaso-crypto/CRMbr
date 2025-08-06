// src/contexts/VentapelCommercialContext.ts

export const VentapelCommercialContext = {
  // Información de la empresa
  companyInfo: {
    name: "Ventapel Brasil",
    website: "ventapel.com.br",
    yearsExperience: 52,
    factories: 2,
    countries: 5,
    clients: 200,
    installedMachines: 3500,
    employees: 50,
    exclusivePartner: "IPG (Intertape Polymer Group)",
    locations: {
      brazil: "Santa Catarina, São Paulo",
      argentina: "Buenos Aires",
      chile: "Santiago"
    }
  },

  // Propuesta de valor central
  valueProposition: {
    main: "Reducción de hasta 64% en costos del sistema de fechamento",
    core: "No vendemos productos, vendemos soluciones completas a problemas reales",
    approach: "Comprensión sistémica de los procesos de fechamento",
    results: {
      retrabalho_reduction: "95%",
      preparation_time: "70% menos",
      violations_reduction: "60-95%",
      roi_typical: "3-6 meses"
    }
  },

  // Productos y soluciones
  products: {
    sealing: {
      name: "Soluciones de Sellado",
      machines: {
        BP755: {
          name: "BP755",
          type: "Selladora semi-automática",
          benefits: ["Alta velocidad", "Fácil operación", "Bajo mantenimiento"],
          idealFor: "Operaciones medianas a grandes"
        },
        RSA: {
          name: "Seladoras Automáticas RSA",
          type: "Sellado automático con fita activada por agua",
          benefits: ["Design modular", "Bajo mantenimiento", "Alta velocidad"],
          idealFor: "Alto volumen, múltiples tamaños"
        },
        USA2024: {
          name: "Seladoras USA 2024",
          type: "Sellado con Hot Melt",
          benefits: ["Configuraciones flexibles", "Alta velocidad", "Compatibles con Hot Melt"],
          idealFor: "Aplicaciones variadas"
        }
      },
      tapes: {
        VENOM: {
          name: "Fita VENOM",
          type: "Fita reforzada inviolable",
          features: [
            "Imposible abrir sin evidencia",
            "Estructura reforzada para la caja",
            "Adhesión superior en cajas reutilizadas",
            "Tecnología para superficies con residuos"
          ],
          applications: "Anti-furto, seguridad máxima"
        },
        HOT_MELT_6100: {
          name: "Fitas Hot Melt 6100",
          type: "Adhesivo hot melt sensible a presión",
          features: [
            "Excelente adhesión",
            "Cradle to Cradle Certified® Bronze",
            "Fácil desenrollamiento",
            "Alta resistencia a tracción"
          ]
        },
        GORILLA_TAPE: {
          name: "Gorilla Tape",
          type: "Fita de alta performance",
          features: ["Máxima resistencia", "Aplicaciones extremas"]
        },
        WATER_ACTIVATED: {
          name: "Fitas Activadas por Agua",
          type: "Sellado ecológico",
          features: ["100% reciclable", "Inviolable", "Adhesión permanente"]
        }
      }
    },
    filling: {
      name: "Soluciones de Relleno",
      machines: {
        V_FILL_PRO: {
          name: "V-FILL™ PRO",
          speed: "126.5 m/min",
          idealFor: "Alto volumen",
          features: ["Tecnología patentada", "Anti-atolamiento", "Bajo mantenimiento"]
        },
        V_PAD: {
          name: "V-PAD™",
          speed: "55 m/min",
          idealFor: "Protección compacta",
          features: ["Operación simple", "Versátil", "Económico"]
        },
        E_COMFILL: {
          name: "E-COMFILL",
          type: "Transforma papel en almohadas",
          benefits: ["Sustentable", "Flexibilidad de gramatura", "Interface intuitiva"]
        }
      }
    },
    envelopes: {
      name: "Envelopes de Seguridad",
      models: ["PB1", "PB2", "PB3", "PB4", "E300", "E340", "E380", "E440"],
      material: "Papel kraft con adhesivo",
      benefits: ["Inviolable", "Ecológico", "Personalizable"]
    }
  },

  // Casos de éxito REALES
  caseStudies: {
    centauro: {
      company: "Centauro",
      industry: "Retail deportivo",
      problem: "Furtos recurrentes con pérdidas de R$50 millones/año",
      solution: "BP755 + Fita VENOM",
      implementation: "Demo realizada, teste massivo programado",
      expectedResults: {
        furtos_elimination: "95%",
        roi: "2 meses",
        annual_savings: "R$45M"
      },
      status: "En negociación - prueba piloto"
    },
    hyundai: {
      company: "Hyundai",
      stage: "4B - Validación",
      scales: { pain: 5, power: 4, vision: 6, value: 6, control: 7, purchase: 3 },
      closeDate: "15/09/2025",
      solution: "Solución de fechamento completa"
    },
    adidas: {
      company: "Adidas",
      stage: "2D - Qualificación",
      scales: { pain: 3, power: 2, vision: 2, value: 2, control: 2, purchase: 1 },
      closeDate: "30/10/2025",
      solution: "Solución de fechamento"
    },
    zara: {
      company: "Zara",
      stage: "3B - Presentación",
      scales: { pain: 4, power: 4, vision: 5, value: 4, control: 4, purchase: 3 },
      closeDate: "30/09/2025",
      solution: "Envelopes de seguridad"
    },
    wineClub: {
      company: "Wine Club",
      stage: "5C - Contrato firmado",
      scales: { pain: 7, power: 8, vision: 8, value: 7, control: 8, purchase: 4 },
      closeDate: "25/07/2025",
      solution: "Solución de preenchimento"
    }
  },

  // Metodología PPVVCC completa
  methodology: {
    scales: {
      pain: {
        name: "DOR",
        description: "Cliente reconoce y cuantifica el problema",
        levels: {
          0: "No hay identificación de necesidad",
          1: "Vendedor asume necesidades",
          2: "Contacto admite necesidad",
          3: "Contacto admite razones y síntomas",
          4: "Contacto admite dolor",
          5: "Vendedor documenta dolor y contacto concuerda",
          6: "Contacto formaliza necesidades del decisor",
          7: "Decisor admite necesidades",
          8: "Decisor admite razones y síntomas",
          9: "Decisor admite dolor",
          10: "Vendedor documenta dolor y decisor concuerda"
        },
        criticalThreshold: 5,
        blocksAdvance: true
      },
      power: {
        name: "PODER",
        description: "Acceso al tomador de decisión real",
        levels: {
          0: "Decisor no identificado",
          1: "Proceso revelado por contacto",
          2: "Decisor potencial identificado",
          3: "Pedido de acceso acordado",
          4: "Decisor accedido",
          5: "Decisor acepta explorar oportunidad",
          6: "Proceso confirmado con decisor",
          7: "Decisor acepta prueba de valor",
          8: "Decisor concuerda con propuesta",
          9: "Aprobación verbal",
          10: "Aprobación formal interna"
        },
        criticalThreshold: 4,
        blocksAdvance: true
      },
      vision: {
        name: "VISÃO",
        description: "Cliente entiende la solución completa",
        levels: {
          0: "Sin visión o visión competencia",
          1: "Visión de producto básico",
          2: "Visión inicial del problema",
          3: "Visión diferenciada con contacto",
          4: "Visión documentada",
          5: "Documentación acordada por contacto",
          6: "Visión del decisor en producto",
          7: "Visión poder en situación/problema",
          8: "Visión diferenciada con decisor",
          9: "Visión documentada con decisor",
          10: "Documentación acordada por decisor"
        },
        criticalThreshold: 4
      },
      value: {
        name: "VALOR",
        description: "Cliente reconoce ROI y valor",
        levels: {
          0: "Valor no identificado",
          1: "Vendedor identifica proposición de valor",
          2: "Contacto acepta explorar propuesta",
          3: "Decisor informado del valor",
          4: "Valor del negocio validado",
          5: "Decisor acepta valor",
          6: "ROI documentado",
          7: "Business case aprobado",
          8: "Presupuesto identificado",
          9: "Fondos aprobados",
          10: "PO autorizada"
        },
        criticalThreshold: 4
      },
      control: {
        name: "CONTROLE",
        description: "Control del proceso de venta",
        levels: {
          0: "Sin follow-up documentado",
          1: "Primera visión enviada",
          2: "Visión acordada/modificada",
          3: "Plan de evaluación propuesto",
          4: "Criterios de éxito definidos",
          5: "Plan de evaluación acordado",
          6: "Implementación en progreso",
          7: "Éxito técnico logrado",
          8: "Éxito de negocio logrado",
          9: "Propuesta enviada",
          10: "Firma programada"
        },
        criticalThreshold: 3
      },
      purchase: {
        name: "COMPRAS",
        description: "Proceso de compra mapeado",
        levels: {
          0: "Proceso desconocido",
          1: "Proceso esclarecido por contacto",
          2: "Proceso confirmado por decisor",
          3: "Condiciones comerciales validadas",
          4: "Propuesta formal enviada",
          5: "Negociación con compras iniciada",
          6: "Condiciones finalizadas",
          7: "Contrato firmado",
          8: "Pedido oficializado",
          9: "Factura emitida",
          10: "Pago realizado"
        },
        criticalThreshold: 2
      }
    }
  },

  // Preguntas SPIN por industria
  spinQuestions: {
    retail: {
      situation: [
        "¿Cuántos envíos procesan desde el CD a las tiendas?",
        "¿Qué tipo de embalaje usan para los transfers?",
        "¿Reutilizan las cajas entre tiendas?",
        "¿Tienen KPIs de pérdida o furto?"
      ],
      problem: [
        "¿Cuántos furtos reportan por mes?",
        "¿Hay tensión con las tiendas por productos faltantes?",
        "¿Tienen que reponer envíos por violación?",
        "¿Las cajas llegan abiertas o dañadas?"
      ],
      implication: [
        "¿Cuánto pierden anualmente por furtos? Centauro pierde R$50M",
        "¿Cómo afecta a la relación con las franquicias?",
        "¿Qué implica no cumplir los KPIs de seguridad?",
        "¿Cuánto cuesta el retrabalho de reposición?"
      ],
      needPayoff: [
        "¿Qué significaría eliminar 95% de los furtos?",
        "¿Cuánto vale recuperar R$45M anuales?",
        "¿Cómo mejoraría la relación con las tiendas?",
        "¿Qué impacto tendría en sus KPIs?"
      ]
    },
    ecommerce: {
      situation: [
        "¿Cuántos pedidos/día procesan?",
        "¿Qué % son devoluciones?",
        "¿Usan cajas nuevas o recicladas?",
        "¿Cuál es su NPS actual?"
      ],
      problem: [
        "¿Cuántas devoluciones son por producto dañado?",
        "¿Tienen reclamos por cajas abiertas?",
        "¿Hay retrabalho por mal sellado?",
        "¿El empaquetado es un cuello de botella?"
      ],
      implication: [
        "¿Cuánto cuesta cada devolución? (promedio R$35)",
        "¿Cómo afecta al NPS las cajas dañadas?",
        "¿Cuántas horas/mes en retrabalho?",
        "¿Pierden ventas por mala experiencia?"
      ],
      needPayoff: [
        "¿Qué vale reducir 40% las devoluciones?",
        "¿Cuánto ahorrarían con cero retrabalho?",
        "¿Qué significaría +12 puntos de NPS?",
        "¿Cómo impactaría en recompra?"
      ]
    },
    logistics3pl: {
      situation: [
        "¿Cuántos clientes atienden?",
        "¿Qué SLAs tienen comprometidos?",
        "¿Cómo cobran el empaquetado?",
        "¿Cuál es su margen operativo?"
      ],
      problem: [
        "¿Tienen multas por incumplimiento SLA?",
        "¿Hay retrabalho por violación?",
        "¿Los clientes reclaman por daños?",
        "¿La productividad es un problema?"
      ],
      implication: [
        "¿Cuánto pagan en multas anuales?",
        "¿Qué cuesta perder un cliente grande?",
        "¿Cuánto pierden en retrabalho?",
        "¿Cómo afecta a nuevos contratos?"
      ],
      needPayoff: [
        "¿Qué vale cumplir 99.8% SLAs?",
        "¿Cuánto ganarían con 45% más productividad?",
        "¿Qué significaría cero multas?",
        "¿Cómo los diferenciaría en licitaciones?"
      ]
    },
    manufacturing: {
      situation: [
        "¿Cuántas líneas de producción tienen?",
        "¿Qué volumen diario manejan?",
        "¿Tienen certificaciones de calidad?",
        "¿Exportan productos?"
      ],
      problem: [
        "¿Hay paradas por problemas de embalaje?",
        "¿Tienen rechazos por mal sellado?",
        "¿Hay accidentes ergonómicos?",
        "¿El embalaje manual es lento?"
      ],
      implication: [
        "¿Cuánto cuesta una hora de línea parada?",
        "¿Qué implica un rechazo de lote?",
        "¿Cuánto pagan en compensaciones?",
        "¿Cómo afecta a la capacidad productiva?"
      ],
      needPayoff: [
        "¿Qué vale automatizar el sellado?",
        "¿Cuánto ahorrarían en mano de obra?",
        "¿Qué significa cero accidentes?",
        "¿Cómo impactaría en la capacidad?"
      ]
    }
  },

  // Target personas y decisores
  targetPersonas: {
    idealContacts: {
      logistics_manager: {
        title: "Gerente de Logística",
        painPoints: ["Retrabalho", "KPIs de daños", "Multas SLA"],
        motivation: "Reducir costos operativos y mejorar indicadores",
        approach: "Datos concretos de ROI y casos similares"
      },
      operations_manager: {
        title: "Gerente de Operaciones",
        painPoints: ["Productividad", "Cuellos de botella", "Costos"],
        motivation: "Optimizar procesos y reducir tiempos",
        approach: "Demo en vivo y prueba piloto"
      },
      quality_manager: {
        title: "Gerente de Calidad",
        painPoints: ["Rechazos", "Certificaciones", "Reclamos"],
        motivation: "Mejorar indicadores de calidad",
        approach: "Certificaciones y estándares"
      },
      general_director: {
        title: "Director General",
        painPoints: ["Margen", "Competitividad", "Crecimiento"],
        motivation: "Resultados financieros y diferenciación",
        approach: "Business case ejecutivo con ROI claro"
      },
      sustainability_manager: {
        title: "Gerente de Sustentabilidad",
        painPoints: ["Huella carbono", "Desperdicio", "Reportes ESG"],
        motivation: "Cumplir metas ambientales",
        approach: "Certificaciones verdes y reducción plástico"
      }
    },
    toAvoid: {
      purchasing: {
        title: "Compras",
        issue: "Solo ve precio, no valor",
        strategy: "Escalar a usuario técnico primero, involucrar compras al final con ROI documentado"
      }
    }
  },

  // Calculadoras de ROI
  roiCalculators: {
    furtos: {
      name: "Calculadora Anti-Furtos (Caso Centauro)",
      formula: (furtos_anuales_reales) => {
        const reduccion = 0.95; // 95% reducción con VENOM
        const ahorro_anual = furtos_anuales_reales * reduccion;
        const inversion = 150000; // Inversión típica BP755 + VENOM
        return {
          perdida_actual: furtos_anuales_reales,
          ahorro_anual: ahorro_anual,
          roi_meses: Math.ceil(inversion / (ahorro_anual / 12)),
          vpn_3_anos: (ahorro_anual * 3) - inversion
        };
      },
      example: {
        input: { furtos_anuales: 50000000 },
        output: {
          perdida_actual: "R$50M",
          ahorro_anual: "R$47.5M",
          roi_meses: "2 meses",
          vpn_3_anos: "R$142M"
        }
      }
    },
    retrabalho: {
      name: "Calculadora Retrabalho",
      formula: (envios_mes, tasa_violacion, costo_hora, minutos_retrabalho) => {
        const retrabalho_mes = envios_mes * (tasa_violacion / 100);
        const horas_mes = (retrabalho_mes * minutos_retrabalho) / 60;
        const costo_mensual = horas_mes * costo_hora;
        const reduccion = 0.95; // 95% reducción típica
        return {
          costo_actual_mensual: costo_mensual,
          ahorro_mensual: costo_mensual * reduccion,
          ahorro_anual: costo_mensual * reduccion * 12,
          horas_liberadas: horas_mes * reduccion
        };
      }
    },
    productividad: {
      name: "Calculadora Productividad",
      formula: (cajas_dia, segundos_actuales, segundos_ventapel) => {
        const ahorro_segundos = segundos_actuales - segundos_ventapel;
        const horas_dia = (cajas_dia * ahorro_segundos) / 3600;
        const dias_ano = 250;
        const costo_hora = 25;
        return {
          tiempo_ahorrado_dia: `${horas_dia.toFixed(1)} horas`,
          ahorro_anual: horas_dia * dias_ano * costo_hora,
          operarios_equivalentes: (horas_dia / 8).toFixed(1),
          productividad_aumento: `${((ahorro_segundos/segundos_actuales)*100).toFixed(0)}%`
        };
      }
    }
  },

  // Scripts de objeciones
  objectionHandling: {
    precio: {
      objection: "Es muy caro / No tengo presupuesto",
      response: "Entiendo. Centauro también pensó eso hasta que calculamos sus R$50M en pérdidas por furtos. Con nuestra solución recuperan la inversión en 2 meses. ¿No vale la pena invertir R$150k para recuperar R$47M al año? ¿Cuánto están perdiendo ustedes hoy?",
      technique: "Reframe con caso real + pregunta"
    },
    tiempo: {
      objection: "No es el momento / Ahora no",
      response: "¿Cuándo sería mejor momento para dejar de perder dinero? Cada mes sin resolver esto son R$[X] que no recuperan. Podemos empezar con un piloto de 30 días como hicimos con Centauro. ¿Qué necesitaría pasar para que sea prioridad?",
      technique: "Urgencia + pregunta de implicación"
    },
    competencia: {
      objection: "Ya tenemos proveedor / Usamos 3M",
      response: "Perfecto, 3M hace buenas fitas. ¿Están 100% satisfechos? ¿Qué mejorarían? La diferencia es que 3M vende fita, nosotros vendemos una solución completa que redujo 95% los furtos en Centauro. ¿Les interesa ver la diferencia en una demo de 20 minutos?",
      technique: "Validar + diferenciar + demo"
    },
    autoridad: {
      objection: "No soy quien decide / Necesito consultarlo",
      response: "Por supuesto, es una decisión importante. ¿Con quién lo consultarías? Para que tenga toda la información técnica, ¿podríamos hacer una call de 15 minutos los tres? Así evitamos el teléfono descompuesto y aclaramos dudas técnicas directamente.",
      technique: "Escalar con elegancia"
    },
    necesidad: {
      objection: "No lo necesitamos / Estamos bien así",
      response: "Me alegra que no tengan problemas graves. Solo por curiosidad, ¿cuál es su tasa actual de violación o furto? ¿Y si les digo que podemos mejorar eso en 95% como con Centauro? ¿Vale la pena 20 minutos para ver cuánto podrían estar ahorrando sin saberlo?",
      technique: "Despertar dolor latente"
    },
    confianza: {
      objection: "No los conozco / Son muy nuevos en Brasil",
      response: "Entiendo la preocupación. Llevamos 52 años en Latam, 3500 máquinas instaladas y somos partners exclusivos de IPG. En Brasil ya trabajamos con [mencionar clientes relevantes]. ¿Le gustaría hablar con el gerente de logística de [cliente similar] para que le cuente su experiencia?",
      technique: "Credibilidad + referencia"
    }
  },

  // Mejores prácticas del equipo
  bestPractices: {
    qualification: {
      rule: "No avanzar NUNCA si DOR < 5",
      reason: "Sin dolor documentado no hay venta",
      action: "Volver a SPIN hasta que admita problema cuantificado"
    },
    presentation: {
      rule: "Siempre presentar propuestas en vivo",
      reason: "Garantiza comprensión y manejo de objeciones",
      format: "Video/presencial + email de follow-up",
      include: [
        "Resumen del proceso hasta ahora",
        "Dolores identificados y cuantificados",
        "Solución específica propuesta",
        "ROI y payback calculado",
        "Timeline de implementación",
        "Fecha de decisión acordada"
      ]
    },
    followUp: {
      cold_opportunity: "Si > 5 días sin contacto, llamar inmediatamente",
      after_demo: "Follow-up en 24 horas con resumen y próximos pasos",
      after_proposal: "Seguimiento cada 3 días hasta decisión"
    },
    demos: {
      preparation: "Siempre con producto del cliente o similar",
      participants: "Incluir usuario técnico + decisor",
      focus: "Problema específico, no features",
      close: "Cerrar próximo paso antes de terminar"
    },
    pilots: {
      centauro_model: "Test masivo en turno completo",
      metrics: "Definir KPIs de éxito antes de empezar",
      duration: "30 días máximo",
      commitment: "Acordar que si funciona, compran"
    }
  },

  // Email templates
  emailTemplates: {
    cold_centauro_style: {
      subject: "[EMPRESA] - Eliminar furtos como Centauro",
      body: `Hola [NOMBRE],

Vi que manejan [X] transfers mensuales a tiendas. 

Centauro perdía R$50M/año en furtos hasta que implementó nuestra solución VENOM. 
Resultado: 95% reducción, ROI en 2 meses.

¿15 minutos esta semana para mostrarle cómo?

Saludos,
[TU NOMBRE]`
    },
    follow_up_after_demo: {
      subject: "Re: Demo VENOM - Próximos pasos",
      body: `[NOMBRE],

Gracias por el tiempo ayer. Resumo lo acordado:

✅ Problema identificado: [X]% violación, R$[Y] pérdida mensual
✅ Solución propuesta: BP755 + VENOM
✅ ROI proyectado: [Z] meses

Próximo paso: Test en turno completo el [FECHA]

¿Confirmamos para coordinar con su equipo?`
    },
    proposal_executive: {
      subject: "[EMPRESA] - Propuesta ahorro R$[X]M anuales",
      body: `[NOMBRE],

Como discutimos, adjunto propuesta para eliminar los R$[X]M en pérdidas anuales.

Highlights:
• Inversión: R$[Y]
• Ahorro anual: R$[X]M
• Payback: [Z] meses
• Implementación: 30 días

Fecha decisión acordada: [FECHA]

¿Revisamos juntos mañana a las 10am?`
    },
    reactivation: {
      subject: "¿Sigue perdiendo R$[X] por mes?",
      body: `[NOMBRE],

Hace [DÍAS] días hablamos sobre sus pérdidas de R$[X] mensuales.

Centauro ya está ahorrando R$4M/mes desde que implementó nuestra solución.

¿Sigue siendo un problema para ustedes?

Si no es prioridad ahora, ¿cuándo podríamos retomar?`
    }
  },

  // Competitive intelligence
  competitors: {
    main: {
      "3M": {
        strengths: ["Marca reconocida", "Distribución amplia"],
        weaknesses: ["Solo vende producto", "Sin soporte local", "No personaliza"],
        counter: "3M vende fita, nosotros vendemos solución completa con ROI garantizado"
      },
      "tesa": {
        strengths: ["Calidad alemana", "Tecnología"],
        weaknesses: ["Precio alto", "Sin casos locales", "Soporte limitado"],
        counter: "tesa es buena fita, pero ¿quién los ayuda con la implementación?"
      },
      "BOPP_generico": {
        strengths: ["Precio bajo", "Disponibilidad"],
        weaknesses: ["Sin seguridad", "Alto retrabalho", "Fácil violación"],
        counter: "BOPP es barato hasta que calculás las pérdidas por furto"
      }
    },
    differentiation: {
      unique_value: [
        "Solución integral, no solo producto",
        "ROI garantizado y medible",
        "Soporte técnico dedicado local",
        "Casos de éxito comprobados (Centauro)",
        "52 años de experiencia en Latam",
        "Tecnología VENOM exclusiva anti-furto",
        "Comodato de equipos disponible"
      ]
    }
  },

  // KPIs y métricas de éxito
  successMetrics: {
    implementation: {
      typical_timeline: "30 días",
      phases: [
        "Semana 1-2: Assessment y diseño",
        "Semana 3-4: Instalación y training",
        "Semana 5-6: Go-live y ajustes"
      ]
    },
    expected_results: {
      month_1: "50% reducción en problemas",
      month_3: "85% optimización",
      month_6: "95% resultados finales, ROI completo"
    },
    kpis_to_track: [
      "Tasa de violación/furto (%)",
      "Horas de retrabalho",
      "Costo por empaque",
      "Productividad (cajas/hora)",
      "NPS impacto",
      "Multas SLA"
    ]
  }
};
