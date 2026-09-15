# REGISTRO DE BASELINE E CONGELAMENTO — FASE 0
Data: 14/09/2026
Branch: security/auth-phase-1
Tag de Rollback: v0.9-pre-auth-baseline
Commit Base: eb327c9
Projeto: C:\Users\Guilherme\Contabilidade-hibrida dentista (Dental Finance)

---

## 1. Status Funcional Pré-Migração (13 Módulos)

- Autenticação: PASS
- Pacientes: PASS
- Agenda: PASM
- Procedimentos: PASS
- Insumos: PASS
- Receitas & Vendas: PASS
- Contas a Receber: PASM
- Despesas: PASM
- Contas a Pagar: PASM
- Recorrências: PASS
- Contas Bancárias: PASS
- Impostos / Fator R: PASM
- Integração Contábilex: PASS

---

## 2. Inventário de Dados por Tenant

- Daniel Ricardo Arantes: clinic_1789153962617_gpw1 (Odonto Dani / CRO-MG 12345 / danielricardoarantes@gmail.com / ffe678ce-609f-4348-922c-9cd12ea02244)
- Leonardo Ricardo Arantes: clinic_1789405023533_phq5 (leonardoricardoarantes@gmail.com / b06c9529-95b8-41dc-a4d7-9c90fb05fd40)

---

## 3. Vazamentos fixados na Fase 1
- Remoção de getAllUsers()
- Aut no Supabase Auth
- Sessão regular sem vazamento de hash/salt
- Recuperação segura sem exibição de token
