"use client";

import Auth_Form from "../Auth_Form";

export default function SignupPage() {
  return (
    <Auth_Form
      title="Create an Account"
      button_txt="Sign Up"
      is_login={false}
      sub_text="Already have an account?"
      link="Log in"
    />
  );
}
