module UnderstandingTypingJudgments where

data Nat : Set where
    Z : Nat
    S : Nat -> Nat

data _isLessThanOrEqualTo_ : Nat -> Nat -> Set where
    Z<=n : {n : Nat} -> Z isLessThanOrEqualTo n
    Sm<=Sn : {m : Nat} -> {n : Nat} -> m isLessThanOrEqualTo n -> (S m) isLessThanOrEqualTo (S n)

twoIsLessThanThree : (S (S Z)) isLessThanOrEqualTo (S (S (S Z)))
twoIsLessThanThree = Sm<=Sn (Sm<=Sn Z<=n)

-- PHOAS approach to binding
mutual
    data Expr (A : Set) : Set where
        Val : Value A -> Expr A
        App : Expr A -> Expr A -> Expr A
        Var : A -> Expr A

    data Value (A : Set) : Set where
        Lambda : (A -> Expr A) -> Value A

-- A closed expression
CExpr : Set1
CExpr = {A : Set} -> Expr A

-- A closed expression that is a value
CValue : Set1
CValue = {A : Set} -> Value A

subst : {A : Set} -> Expr (Expr A) -> Expr A
subst (Var e) = e
subst (Val (Lambda b)) = Val (Lambda (λ a -> subst (b (Var a))))
subst (App e1 e2) = App (subst e1) (subst e2)

data _EvaluatesTo_ : CExpr -> CValue -> Set1 where
    EvaluateTrivial : {v : CValue} -> (Val v) EvaluatesTo v
    EvaluateApp : {e1 : CExpr} -> {e2 : CExpr}
        -> {e : {A : Set} -> A -> Expr A}
        -> {v2 : CValue} -> {v : CValue}
        -> e1 EvaluatesTo (Lambda e)
        -> e2 EvaluatesTo v2
        -> (subst (e (Val v2))) EvaluatesTo v
        -> (App e1 e2) EvaluatesTo v

data TType : Set where
    TTVar : Nat -> TType                    -- α
    _=>_ : TType -> TType -> TType          -- τ → τ
    Forall : TType -> TType                 -- ∀α. τ

mutual
    data TExpr : Set where
        TVal : TValue -> TExpr              -- v
        TApp : TExpr -> TExpr -> TExpr      -- f x
        TTyApp : TExpr -> TType -> TExpr    -- e[τ]
        TVar : Nat -> TExpr                 -- x

    data TValue : Set where
        TLambda : TType -> TExpr -> TValue  -- λx:τ.e
        TTyLambda : TExpr -> TValue         -- Λτ.e
        TConst : Nat -> TValue              -- c

data List (A : Set) : Set where
    Nil : List A
    _,_ : List A -> A -> List A

Context : Set
Context = List TType

TypeContext : Set
TypeContext = Nat

Signature : Set
Signature = List TType

data _<_ : Nat -> Nat -> Set where
    Z<Sn : {n : Nat} -> Z < S n
    Sn<SSm : {n m : Nat} -> n < S m -> S n < S (S m)

data _isValidIn_ : TType -> TypeContext -> Set where
    TyVarJ : {n : Nat} -> {ctx : TypeContext} -> n < ctx -> (TTVar n) isValidIn ctx
    TyArrJ : {t1 t2 : TType} -> {ctx : TypeContext} -> t1 isValidIn ctx -> t2 isValidIn ctx -> (t1 => t2) isValidIn ctx
    TyForallJ : {t : TType} -> {ctx : TypeContext} -> t isValidIn (S ctx) -> (Forall t) isValidIn ctx

tySubst : TType -> TType -> TType
tySubst t1 t2 = tySubst' t1 t2 Z
    where tySubst' : TType -> TType -> Nat -> TType
          tySubst' (TTVar Z) t2 Z = t2
          tySubst' (TTVar Z) t2 (S _) = TTVar Z
          tySubst' (TTVar (S n)) t2 Z = TTVar (S n)
          tySubst' (TTVar (S n)) t2 (S d) = tySubst' (TTVar n) t2 d
          tySubst' (t1 => t2) t3 d = tySubst' t1 t3 d => tySubst' t2 t3 d
          tySubst' (Forall t1) t2 d = tySubst' t1 t2 (S d)

data _isIn_at_ {A : Set} : A -> List A -> Nat -> Set where
    Found : {a : A} -> {l : List A} -> a isIn (l , a) at Z
    Next : {a : A} -> {b : A} -> {l : List A} -> {n : Nat} -> a isIn l at n -> a isIn (l , b) at (S n)

data _hasType_inContext_and_given_ : TExpr -> TType -> Context -> TypeContext -> Signature -> Set where
    ConstJ : {t : TType} -> {c : Nat}
        -> {Sigma : Signature} -> {Gamma : Context} -> {Delta : TypeContext}
        -> t isIn Sigma at c
        -> t isValidIn Delta
        -> (TVal (TConst c)) hasType t inContext Gamma and Delta given Sigma

    VarJ : {t : TType} -> {x : Nat}
        -> {Sigma : Signature} -> {Gamma : Context} -> {Delta : TypeContext}
        -> t isIn Gamma at x
        -> t isValidIn Delta
        -> (TVar x) hasType t inContext Gamma and Delta given Sigma

    AppJ : {t1 : TType} -> {t2 : TType} -> {e1 : TExpr} -> {e2 : TExpr}
        -> {Sigma : Signature} -> {Gamma : Context} -> {Delta : TypeContext}
        -> e1 hasType (t1 => t2) inContext Gamma and Delta given Sigma
        -> e2 hasType t1 inContext Gamma and Delta given Sigma
        -> (TApp e1 e2) hasType t2 inContext Gamma and Delta given Sigma

    TyAppJ : {t1 : TType} -> {t2 : TType} -> {e : TExpr}
        -> {Sigma : Signature} -> {Gamma : Context} -> {Delta : TypeContext}
        -> e hasType (Forall t1) inContext Gamma and Delta given Sigma
        -> t2 isValidIn Delta
        -> (TTyApp e t2) hasType (tySubst t1 t2) inContext Gamma and Delta given Sigma

    AbsJ : {t1 : TType} -> {t2 : TType} -> {e : TExpr}
        -> {Sigma : Signature} -> {Gamma : Context} -> {Delta : TypeContext}
        -> e hasType t2 inContext (Gamma , t1) and Delta given Sigma
        -> (TVal (TLambda t1 e)) hasType (t1 => t2) inContext Gamma and Delta given Sigma

    TyAbsJ : {t : TType} -> {e : TExpr}
        -> {Sigma : Signature} -> {Gamma : Context} -> {Delta : TypeContext}
        -> e hasType t inContext Gamma and (S Delta) given Sigma
        -> (TVal (TTyLambda e)) hasType (Forall t) inContext Gamma and Delta given Sigma

tyLam : TExpr -> TExpr
tyLam e = TVal (TTyLambda e)

lam : TType -> TExpr -> TExpr
lam t e = TVal (TLambda t e)

polyConst
    : tyLam (tyLam (lam (TTVar Z) (lam (TTVar (S Z)) (TVar (S Z)))))    -- Λs.Λt.λx:t.λy:s.x
    hasType (Forall (Forall (TTVar Z => (TTVar (S Z) => TTVar Z))))     -- ∀s.∀t.t→s→t
    inContext Nil and Z
    given Nil
polyConst = TyAbsJ (TyAbsJ (AbsJ (AbsJ (VarJ (Next Found) (TyVarJ Z<Sn))))) -- written by Agda

data False : Set where

Not : Set -> Set
Not A = A -> False

wrongType
    : Not (tyLam (lam (TTVar Z) (TVar Z))   -- Λt.λx:t.x
    hasType (Forall (TTVar Z))              -- ∀t.t
    inContext Nil and Z
    given Nil)
wrongType (TyAbsJ ())

data Maybe (A : Set) : Set where
    Nothing : Maybe A
    Just : A -> Maybe A

typeCheck : (e : TExpr) -> (t : TType) -> (sig : Signature) -> Maybe (e hasType t inContext Nil and Z given sig)
typeCheck = ?

data Decidable (A : Set) : Set where
    IsTrue : A -> Decidable A
    IsFalse : Not A -> Decidable A

typeCheckDec : (e : TExpr) -> (t : TType) -> (sig : Signature) -> Decidable (e hasType t inContext Nil and Z given sig)
typeCheckDec = ?

record Σ (T : Set) (F : T -> Set) : Set where
    field
        fst : T
        snd : F fst

inferType : (e : TExpr) -> (sig : Signature) -> Maybe (Σ TType (λ t → e hasType t inContext Nil and Z given sig))
inferType = ?

inferTypeDec : (e : TExpr) -> (sig : Signature) -> Decidable (Σ TType (λ t → e hasType t inContext Nil and Z given sig))
inferTypeDec = ?
