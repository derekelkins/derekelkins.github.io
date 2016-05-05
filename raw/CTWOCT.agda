module CTWOCT where

open import Level
open import Data.Bool
open import Data.Empty
open import Data.Unit
open import Data.Sum
open import Data.Product
open import Relation.Binary.Core
open import Relation.Binary.PropositionalEquality

{-
_Respects_ : ∀ {a ℓ₁ ℓ₂} {A : Set a} → (A → Set ℓ₁) → Rel A ℓ₂ → Set _
P Respects _∼_ = ∀ {x y} → x ∼ y → P x → P y
-}

module _ {i j : Level}{Sort : Set i}{F : Sort → Sort → Set j} where
    data Term : Sort → Set (i ⊔ j) where
        Var : (s : Sort) → Term s
        Op : {dom cod : Sort} → (f : F dom cod) → Term dom → Term cod

    record Equation : Set (i ⊔ j) where
        constructor _∋_==_ -- ∋ is \ni
        field
            sort : Sort
            lhs rhs : Term sort
    open Equation

    data TermEq {k}{s : Sort}{Eq : Set k}(eqs : Eq → Equation) : Term s → Term s → Set (i ⊔ j ⊔ k) where
        Axiom : {e1 e2 : Term s} → (e1 ≡ e2) → TermEq eqs e1 e2
        Identify : {e1 e2 : Term s} → (eq : Eq) → (p : s ≡ sort (eqs eq)) → (subst Term p e1 ≡ lhs (eqs eq)) → (subst Term p e2 ≡ rhs (eqs eq)) → TermEq eqs e1 e2
        IdentifySym : {e1 e2 : Term s} → (eq : Eq) → (p : s ≡ sort (eqs eq)) → (subst Term p e2 ≡ lhs (eqs eq)) → (subst Term p e1 ≡ rhs (eqs eq)) → TermEq eqs e1 e2
        TransEq : {e1 e2 e3 : Term s} → TermEq eqs e1 e2 → TermEq eqs e2 e3 → TermEq eqs e1 e3
        Congruence : {dom : Sort}{e1 e2 : Term dom} → (f : F dom s) →  TermEq eqs e1 e2 → TermEq eqs (Op f e1) (Op f e2)

    _makes_⊣⊢_ : ∀{k} → {Eq : Set k} → (Eq → Equation) → Σ Sort Term → Σ Sort Term → Set (i ⊔ j ⊔ k) -- ⊣ is \provedby, ⊢ is \proves        
    _makes_⊣⊢_ eqs (s , e1) (t , e2) = Σ[ p ∈ (s ≡ t)] (TermEq eqs (subst Term p e1) e2)

    ⊣⊢-IsEquivalence : ∀{k} → {Eq : Set k} → (eqs : Eq → Equation) → IsEquivalence (_makes_⊣⊢_ eqs)
    ⊣⊢-IsEquivalence eqs = record {refl = refl , Axiom refl; sym = symProof; trans = transProof}
        where symProof : {se1 te2 : Σ Sort Term} → Σ[ p ∈ (proj₁ se1 ≡ proj₁ te2)] (TermEq eqs (subst Term p (proj₂ se1)) (proj₂ te2)) 
                                                 → Σ[ q ∈ (proj₁ te2 ≡ proj₁ se1)] (TermEq eqs (subst Term q (proj₂ te2)) (proj₂ se1))
              symProof (refl , Axiom refl) = refl , Axiom refl
              symProof (refl , Identify eq refl refl refl) = refl , IdentifySym eq refl refl refl
              symProof (refl , IdentifySym eq refl refl refl) = refl , Identify eq refl refl refl
              symProof (refl , TransEq srEq rtEq) with symProof (refl , srEq) | symProof (refl , rtEq) 
              symProof {proj₁ , proj₂} {.proj₁ , proj₃} (refl , TransEq srEq rtEq) | refl , srEq' | refl , rtEq' = refl , TransEq rtEq' srEq'
              symProof (refl , Congruence f stEq) with symProof ( refl , stEq )
              symProof {proj₃ , ._} {.proj₃ , ._} (refl , Congruence f stEq) | refl , tsEq = refl , Congruence f tsEq
              transProof : {re1 se2 te3 : Σ Sort Term} → Σ[ p ∈ (proj₁ re1 ≡ proj₁ se2)] (TermEq eqs (subst Term p (proj₂ re1)) (proj₂ se2)) 
                                                       → Σ[ q ∈ (proj₁ se2 ≡ proj₁ te3)] (TermEq eqs (subst Term q (proj₂ se2)) (proj₂ te3))
                                                       → Σ[ q ∈ (proj₁ re1 ≡ proj₁ te3)] (TermEq eqs (subst Term q (proj₂ re1)) (proj₂ te3))
              transProof (refl , Axiom refl) y = y
              transProof (refl , rsEq) (refl , Axiom refl) = refl , rsEq
              transProof (refl , rsEq) (refl , stEq) = refl , TransEq rsEq stEq


record Signature {i j} : Set (suc (i ⊔ j)) where
    field
        sorts : Set i
        functionSymbols : sorts → sorts → Set j
    terms : sorts → Set (i ⊔ j)
    terms = Term {F = functionSymbols}

record Theory {i j k} : Set (suc (i ⊔ j ⊔ k)) where
    field
        signature : Signature {i} {j}
        equations : Set k

    open Signature signature public 

    field
        eqs : equations → Equation { F = functionSymbols }

    _⊣⊢_ : Σ sorts terms → Σ sorts terms → Set (i ⊔ j ⊔ k)
    _⊣⊢_ = _makes_⊣⊢_ eqs

    ⊣⊢-isEquivalence : IsEquivalence _⊣⊢_
    ⊣⊢-isEquivalence = ⊣⊢-IsEquivalence eqs

SetSignature : Signature
SetSignature = record {
    sorts = Set;
    functionSymbols = λ A B → (A → B)
 }  

record F : Set where constructor f
record G : Set where constructor g

IsoTheory : Theory
IsoTheory = record {
    signature = record {
        sorts = Bool;
        functionSymbols = λ { true false → F; false true → G; _ _ → ⊥ }
    };
    equations = Bool;
    eqs = λ { true → true ∋ Op g (Op f (Var true)) == Var true;
             false → false ∋ Op f (Op g (Var false)) == Var false }
 }

ex1 : Theory._⊣⊢_ IsoTheory (false , (Op f (Op g (Op f (Var true))))) (false , Op f (Var true))
ex1 = refl , Congruence f (Identify true refl refl refl)

{-
module _ {i j : Level}{Sort : Set i}{F : Set j}(dom cod : F → Sort) where
    data Term : Sort → Set (i ⊔ j) where
        Var : (s : Sort) → Term s
        Op : (f : F) → Term (dom f) → Term (cod f)

    record Equation : Set (i ⊔ j) where
        constructor _∋_==_ -- ∋ is \ni
        field
            sort : Sort
            lhs rhs : Term sort
    open Equation

    data TermEq {k}{s : Sort}{Eq : Set k}(eqs : Eq → Equation) : Term s → Term s → Set (i ⊔ j ⊔ k) where
        Axiom : {e1 e2 : Term s} → (e1 ≡ e2) → TermEq eqs e1 e2
        Identify : {e1 e2 : Term s} → (eq : Eq) → (p : s ≡ sort (eqs eq)) → (subst Term p e1 ≡ lhs (eqs eq)) → (subst Term p e2 ≡ rhs (eqs eq)) → TermEq eqs e1 e2
        IdentifySym : {e1 e2 : Term s} → (eq : Eq) → (p : s ≡ sort (eqs eq)) → (subst Term p e2 ≡ lhs (eqs eq)) → (subst Term p e1 ≡ rhs (eqs eq)) → TermEq eqs e1 e2
        TransEq : {e1 e2 e3 : Term s} → TermEq eqs e1 e2 → TermEq eqs e2 e3 → TermEq eqs e1 e3
        Congruence : {f : F}{e1 e2 : Term (dom f)} → (p : cod f ≡ s) → TermEq eqs e1 e2 → TermEq eqs (subst Term p (Op f e1)) (subst Term p (Op f e2))

    _makes_⊣⊢_ : ∀{k} → {Eq : Set k} → (Eq → Equation) → Σ Sort Term → Σ Sort Term → Set (i ⊔ j ⊔ k) -- ⊣ is \provedby, ⊢ is \proves        
    _makes_⊣⊢_ eqs (s , e1) (t , e2) = Σ[ p ∈ (s ≡ t)] (TermEq eqs (subst Term p e1) e2)

    ⊣⊢-IsEquivalence : ∀{k} → {Eq : Set k} → (eqs : Eq → Equation) → IsEquivalence (_makes_⊣⊢_ eqs)
    ⊣⊢-IsEquivalence eqs = record {refl = refl , Axiom refl; sym = symProof; trans = transProof}
        where symProof : {se1 te2 : Σ Sort Term} → Σ[ p ∈ (proj₁ se1 ≡ proj₁ te2)] (TermEq eqs (subst Term p (proj₂ se1)) (proj₂ te2)) 
                                                 → Σ[ q ∈ (proj₁ te2 ≡ proj₁ se1)] (TermEq eqs (subst Term q (proj₂ te2)) (proj₂ se1))
              symProof (refl , Axiom refl) = refl , Axiom refl
              symProof (refl , Identify eq refl refl refl) = refl , IdentifySym eq refl refl refl
              symProof (refl , IdentifySym eq refl refl refl) = refl , Identify eq refl refl refl
              symProof (refl , TransEq srEq rtEq) with symProof (refl , srEq) | symProof (refl , rtEq) 
              symProof {proj₁ , proj₂} {.proj₁ , proj₃} (refl , TransEq srEq rtEq) | refl , srEq' | refl , rtEq' = refl , TransEq rtEq' srEq'
              symProof (refl , Congruence p stEq) with symProof ( refl , stEq )
              symProof {._ , ._} {._ , ._} (refl , Congruence refl stEq) | refl , tsEq = refl , Congruence refl tsEq
              transProof : {re1 se2 te3 : Σ Sort Term} → Σ[ p ∈ (proj₁ re1 ≡ proj₁ se2)] (TermEq eqs (subst Term p (proj₂ re1)) (proj₂ se2)) 
                                                       → Σ[ q ∈ (proj₁ se2 ≡ proj₁ te3)] (TermEq eqs (subst Term q (proj₂ se2)) (proj₂ te3))
                                                       → Σ[ q ∈ (proj₁ re1 ≡ proj₁ te3)] (TermEq eqs (subst Term q (proj₂ re1)) (proj₂ te3))
              transProof (refl , Axiom refl) y = y
              transProof (refl , rsEq) (refl , stEq) = refl , TransEq rsEq stEq


record Signature {i j} : Set (suc (i ⊔ j)) where
    field
        sorts : Set i
        functionSymbols : Set j
        dom : functionSymbols → sorts
        cod : functionSymbols → sorts
    terms : sorts → Set (i ⊔ j)
    terms = Term dom cod

record Theory {i j k} : Set (suc (i ⊔ j ⊔ k)) where
    field
        signature : Signature {i} {j}
        equations : Set k

    open Signature signature public 

    field
        eqs : equations → Equation dom cod

    _⊣⊢_ : Σ sorts terms → Σ sorts terms → Set (i ⊔ j ⊔ k)
    _⊣⊢_ = _makes_⊣⊢_ dom cod eqs

    ⊣⊢-isEquivalence : IsEquivalence _⊣⊢_
    ⊣⊢-isEquivalence = ⊣⊢-IsEquivalence dom cod eqs

SetSignature : Signature
SetSignature = record {
    sorts = Set;
    functionSymbols = Σ[ A ∈ Set ] (Σ[ B ∈ Set ] (A → B));
    dom = λ { (a , _) → a };
    cod = λ { (_ , (b , _)) → b }
 }  

IsoTheory : Theory
IsoTheory = record {
    signature = record {
        sorts = Bool;
        functionSymbols = Bool;
        dom = λ x → x;
        cod = not
    };
    equations = Bool;
    eqs = λ { true → true ∋ Op false (Op true (Var true)) == Var true;
             false → false ∋ Op true (Op false (Var false)) == Var false }
 }

ex1 : Theory._⊣⊢_ IsoTheory (false , (Op true (Op false (Op true (Var true))))) (false , Op true (Var true))
ex1 = refl , Congruence refl (Identify true refl refl refl)
-}

{-
module _ {i j k : Level}{Sort : Set i}{V : Set j}{F : Set k}(sorting : V → Sort)(dom cod : F → Sort) where
    data Term : Sort → Set (i ⊔ j ⊔ k) where
        Var : (v : V) → Term (sorting v)
        Op : (f : F) → Term (dom f) → Term (cod f)

    --TheoryFor = ∀{l} → {Eq : Set l} → Eq → (s : Sort) → Term s × Term s

    data TermEq {l}{s : Sort}{Eq : Set l}(eqs : Eq → (s : Sort) → Term s × Term s) : Term s → Term s → Set (i ⊔ j ⊔ k ⊔ l) where
        Axiom : {e1 e2 : Term s} → (e1 ≡ e2) → TermEq eqs e1 e2
        Identify : {e1 e2 : Term s} → (eq : Eq) → (e1 ≡ proj₁ (eqs eq s)) → (e2 ≡ proj₂ (eqs eq s)) → TermEq eqs e1 e2
        IdentifySym : {e1 e2 : Term s} → (eq : Eq) → (e2 ≡ proj₁ (eqs eq s)) → (e1 ≡ proj₂ (eqs eq s)) → TermEq eqs e1 e2
        TransEq : {e1 e2 e3 : Term s} → TermEq eqs e1 e2 → TermEq eqs e2 e3 → TermEq eqs e1 e3
        Congruence : {f : F}{e1 e2 : Term (dom f)} → (p : cod f ≡ s) → TermEq eqs e1 e2 → TermEq eqs (subst Term p (Op f e1)) (subst Term p (Op f e2))

    _makes_⊣⊢_ : ∀{l} → {Eq : Set l} → (Eq → (s : Sort) → Term s × Term s) → Σ Sort Term → Σ Sort Term → Set (i ⊔ j ⊔ k ⊔ l) -- ⊣ is \provedby, ⊢ is \proves        
    _makes_⊣⊢_ {l} {Eq} eqs (s , e1) (t , e2) = Σ[ p ∈ (s ≡ t)] (TermEq eqs (subst Term p e1) e2)

    ⊣⊢-IsEquivalence : ∀{l} → {Eq : Set l} → (eqs : Eq → (s : Sort) → Term s × Term s) → IsEquivalence (_makes_⊣⊢_ eqs)
    ⊣⊢-IsEquivalence eqs = record {refl = refl , Axiom refl; sym = symProof; trans = transProof}
        where symProof : {se1 te2 : Σ Sort Term} → Σ[ p ∈ (proj₁ se1 ≡ proj₁ te2)] (TermEq eqs (subst Term p (proj₂ se1)) (proj₂ te2)) 
                                                 → Σ[ q ∈ (proj₁ te2 ≡ proj₁ se1)] (TermEq eqs (subst Term q (proj₂ te2)) (proj₂ se1))
              symProof (refl , Axiom refl) = refl , Axiom refl
              symProof (refl , Identify eq refl refl) = refl , IdentifySym eq refl refl
              symProof (refl , IdentifySym eq refl refl) = refl , Identify eq refl refl
              symProof (refl , TransEq srEq rtEq) with symProof (refl , srEq) | symProof (refl , rtEq) 
              symProof {proj₁ , proj₂} {.proj₁ , proj₃} (refl , TransEq srEq rtEq) | refl , srEq' | refl , rtEq' = refl , TransEq rtEq' srEq'
              symProof (refl , Congruence p stEq) with symProof ( refl , stEq )
              symProof {._ , ._} {._ , ._} (refl , Congruence refl stEq) | refl , tsEq = refl , Congruence refl tsEq
              transProof : {re1 se2 te3 : Σ Sort Term} → Σ[ p ∈ (proj₁ re1 ≡ proj₁ se2)] (TermEq eqs (subst Term p (proj₂ re1)) (proj₂ se2)) 
                                                       → Σ[ q ∈ (proj₁ se2 ≡ proj₁ te3)] (TermEq eqs (subst Term q (proj₂ se2)) (proj₂ te3))
                                                       → Σ[ q ∈ (proj₁ re1 ≡ proj₁ te3)] (TermEq eqs (subst Term q (proj₂ re1)) (proj₂ te3))
              transProof (refl , Axiom refl) y = y
              transProof (refl , rsEq) (refl , stEq) = refl , TransEq rsEq stEq


record Signature {i j k} : Set (suc (i ⊔ j ⊔ k)) where
    field
        sorts : Set i
        vars : Set j
        functionSymbols : Set k
        sorting : vars → sorts
        dom : functionSymbols → sorts
        cod : functionSymbols → sorts
    terms : sorts → Set (i ⊔ j ⊔ k)
    terms = Term sorting dom cod

record Theory {i j k l} : Set (suc (i ⊔ j ⊔ k ⊔ l)) where
    field
        signature : Signature {i} {j} {k}
        equations : Set l

    open Signature signature public 

    field
        eqs : equations → (s : sorts) → terms s × terms s

    _⊣⊢_ : Σ sorts terms → Σ sorts terms → Set (i ⊔ j ⊔ k ⊔ l)
    _⊣⊢_ = _makes_⊣⊢_ sorting dom cod eqs

    ⊣⊢-isEquivalence : IsEquivalence _⊣⊢_
    ⊣⊢-isEquivalence = ⊣⊢-IsEquivalence sorting dom cod eqs

SetSignature : Signature
SetSignature = record {
   sorts = Set;
   vars = Set;
   functionSymbols = Σ[ A ∈ Set ] (Σ[ B ∈ Set ] (A → B));
   sorting = λ T → T;
   dom = λ { (a , _) → a };
   cod = λ { (_ , (b , _)) → b }
 }

 IsoTheory : Theory
 IsoTheory = record {
    signature = record {
        sorts = Bool;
        vars = Bool;
        functionSymbols = Bool;
        sorting = λ x → x;
        dom = λ x → x;
        cod = not
    };
    equations = 
    eqs = 
 }
-}
